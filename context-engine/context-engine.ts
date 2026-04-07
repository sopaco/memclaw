/**
 * Context Engine Implementation — Optimized
 *
 * Design goals:
 * - Minimize LLM/token consumption
 * - Batch operations where possible
 * - Local state tracking to avoid unnecessary API calls
 * - ownsCompaction: false (use OpenClaw built-in compaction)
 *
 * Lifecycle:
 * - ingest:     Buffer messages locally (no network)
 * - assemble:   Auto-recall with cooldown + dedup, inject context
 * - afterTurn:  Batch write + evaluate commit trigger
 * - compact:    Delegate to OpenClaw runtime, optionally trigger close
 */

import { createHash } from 'node:crypto';
import { CortexMemClient, type SearchResult } from './client.js';
import type { ContextEngineConfig } from './config.js';

// ==================== Types ====================

export type AgentMessage = {
	role?: string;
	content?: unknown;
	toolCallId?: string;
	toolName?: string;
	isError?: boolean;
};

export type ContextEngineInfo = {
	id: string;
	name: string;
	version: string;
	ownsCompaction: false;
};

export type IngestResult = {
	ingested: boolean;
};

export type AssembleResult = {
	messages: AgentMessage[];
	estimatedTokens: number;
	systemPromptAddition?: string;
};

export type CompactResult = {
	ok: boolean;
	compacted: boolean;
	reason?: string;
	result?: {
		summary?: string;
		firstKeptEntryId?: string;
		tokensBefore: number;
		tokensAfter?: number;
		details?: unknown;
	};
};

export type Logger = {
	debug?: (msg: string) => void;
	info: (msg: string) => void;
	warn: (msg: string) => void;
	error: (msg: string) => void;
};

// ==================== Session Buffer ====================

interface SessionBuffer {
	sessionId: string;
	openClawSessionId: string;

	// Pending messages from ingest (batched for afterTurn)
	pendingMessages: AgentMessage[];

	// Stats
	messageCount: number;

	// Commit state
	lastCommitAt: Date | null;
	pendingTokens: number;
	isCommitting: boolean;
}

// ==================== Recall Cache ====================

interface RecallState {
	lastQuery: string;
	lastResultCount: number;
	lastAt: Date;
}

// ==================== Token Estimation ====================

/**
 * Simple token estimation: ~4 chars per token.
 * Good enough for thresholds; absolute accuracy not required.
 */
function estimateTokens(messages: AgentMessage[]): number {
	return Math.max(1, Math.ceil(JSON.stringify(messages).length / 4));
}

function estimateMessageChars(msg: AgentMessage): number {
	const raw = msg.content;
	if (typeof raw === 'string') return raw.length;
	if (Array.isArray(raw)) return JSON.stringify(raw).length;
	return 1;
}

// ==================== Session ID Mapping ====================

const OPENCLAW_SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOWS_BAD_SESSION_SEGMENT = /[:<>"\\/|?\u0000-\u001f]/;

/**
 * Map OpenClaw session ID to Cortex session ID (safe for Windows paths)
 */
export function openClawSessionToCortexId(
	sessionId: string | undefined,
	sessionKey: string | undefined
): string {
	const sid = typeof sessionId === 'string' ? sessionId.trim() : '';
	const key = typeof sessionKey === 'string' ? sessionKey.trim() : '';

	if (sid && OPENCLAW_SESSION_UUID.test(sid)) {
		return sid.toLowerCase();
	}

	if (key) {
		return createHash('sha256').update(key, 'utf8').digest('hex');
	}

	if (sid) {
		if (WINDOWS_BAD_SESSION_SEGMENT.test(sid)) {
			return createHash('sha256').update(`openclaw-session:${sid}`, 'utf8').digest('hex');
		}
		return sid;
	}

	throw new Error('Need sessionId or sessionKey for Cortex session path');
}

// ==================== Recall Query Construction ====================

function extractRecentUserTexts(messages: AgentMessage[], window: number): string[] {
	const userTexts: string[] = [];

	for (let i = messages.length - 1; i >= 0 && userTexts.length < window; i--) {
		const msg = messages[i];
		if (msg?.role === 'user') {
			const content = msg.content;
			if (typeof content === 'string' && content.trim().length > 10) {
				userTexts.unshift(content.trim().slice(0, 500));
			}
		}
	}

	return userTexts;
}

/**
 * Check if query is too similar to the last recall query.
 * Uses simple overlap ratio to avoid redundant searches.
 */
function isSimilarQuery(current: string, previous: string, threshold: number = 0.7): boolean {
	if (!previous) return false;

	const a = current.toLowerCase().split(/\s+/);
	const b = previous.toLowerCase().split(/\s+/);

	let overlap = 0;
	for (const word of a) {
		if (word.length < 3) continue; // skip short words
		if (b.includes(word)) overlap++;
	}

	const maxLen = Math.max(a.filter((w) => w.length >= 3).length, 1);
	return overlap / maxLen >= threshold;
}

// ==================== System Prompt Addition ====================

function buildSystemPromptAddition(): string {
	return `
## Memory Guide

Relevant memories from past conversations may appear as tool call results from \`cortex_search\`.
Use them for context, but trust the current conversation for exact details.
To search for more, use \`cortex_search\` or browse with \`cortex_ls\`.
`.trim();
}

// ==================== Context Engine Class ====================

export class ContextEngine {
	private info: ContextEngineInfo;
	private config: ContextEngineConfig;
	private client: CortexMemClient;
	private logger: Logger;

	// Session buffers
	private sessionBuffers: Map<string, SessionBuffer> = new Map();

	// Recall state (per-session, for cooldown + dedup)
	private recallStates: Map<string, RecallState> = new Map();

	constructor(
		info: ContextEngineInfo,
		config: ContextEngineConfig,
		client: CortexMemClient,
		logger: Logger
	) {
		this.info = info;
		this.config = config;
		this.client = client;
		this.logger = logger;
	}

	getInfo(): ContextEngineInfo {
		return this.info;
	}

	// ==================== Ingest ====================

	async ingest(params: {
		sessionId: string;
		message: AgentMessage;
		isHeartbeat?: boolean;
	}): Promise<IngestResult> {
		if (params.isHeartbeat) {
			return { ingested: false };
		}

		const buffer = this.getOrCreateBuffer(params.sessionId);
		buffer.pendingMessages.push(params.message);
		buffer.pendingTokens += estimateMessageChars(params.message) / 4;

		return { ingested: true };
	}

	// ==================== Assemble ====================

	async assemble(params: {
		sessionId: string;
		sessionKey?: string;
		messages: AgentMessage[];
		tokenBudget?: number;
		runtimeContext?: Record<string, unknown>;
	}): Promise<AssembleResult> {
		const originalTokens = estimateTokens(params.messages);

		// If autoRecall disabled, return original messages directly
		if (!this.config.autoRecall) {
			return { messages: params.messages, estimatedTokens: originalTokens };
		}

		try {
			// Try auto-recall with cooldown + dedup
			const recallResult = await this.doAutoRecall(params.sessionId, params.messages);

			if (!recallResult) {
				return { messages: params.messages, estimatedTokens: originalTokens };
			}

			// Inject recall results before active messages
			const assembled: AgentMessage[] = [...recallResult, ...params.messages];

			this.logger.info(
				`[context-engine] Assembled context: ${assembled.length} messages (recalled ${recallResult.length})`
			);

			return {
				messages: assembled,
				estimatedTokens: originalTokens + estimateTokens(recallResult),
				systemPromptAddition: buildSystemPromptAddition()
			};
		} catch (err) {
			this.logger.warn(`[context-engine] Assemble failed: ${err}`);
			return { messages: params.messages, estimatedTokens: originalTokens };
		}
	}

	private async doAutoRecall(
		sessionId: string,
		messages: AgentMessage[]
	): Promise<AgentMessage[] | null> {
		// Extract recent user texts for query
		const userTexts = extractRecentUserTexts(messages, this.config.recallWindow);
		if (userTexts.length === 0) {
			return null;
		}

		const query = userTexts.join(' ');

		// Dedup: skip if query is too similar to last recall for this session
		const state = this.recallStates.get(sessionId);
		if (state && isSimilarQuery(query, state.lastQuery)) {
			this.logger.debug?.(`[context-engine] Auto-recall skipped (similar query)`);
			return null;
		}

		// Cooldown: skip if recalled within the last 60 seconds
		const recallCooldownMs = 60_000;
		if (state && Date.now() - state.lastAt.getTime() < recallCooldownMs) {
			this.logger.debug?.(`[context-engine] Auto-recall skipped (cooldown)`);
			return null;
		}

		try {
			this.logger.debug?.(`[context-engine] Auto-recall query: ${query.slice(0, 100)}...`);

			const results = await this.client.search({
				query,
				limit: this.config.recallLimit,
				min_score: this.config.recallMinScore,
				return_layers: ['L0']
			});

			// Update recall state for this session
			this.recallStates.set(sessionId, {
				lastQuery: query,
				lastResultCount: results.length,
				lastAt: new Date()
			});

			if (results.length === 0) {
				return null;
			}

			// Format as simulated tool call
			const recallContent = this.formatRecallResults(results, query);

			return [
				{
					role: 'assistant',
					content: [
						{
							type: 'toolUse',
							id: 'auto-recall-001',
							name: 'cortex_search',
							input: { query }
						}
					]
				},
				{
					role: 'toolResult',
					toolCallId: 'auto-recall-001',
					content: [{ type: 'text', text: recallContent }]
				}
			];
		} catch (err) {
			this.logger.warn(`[context-engine] Auto-recall failed: ${err}`);
			return null;
		}
	}

	private formatRecallResults(results: SearchResult[], query: string): string {
		const lines = [`Found ${results.length} relevant memories:\n`];

		for (let i = 0; i < results.length; i++) {
			const r = results[i];
			lines.push(`${i + 1}. [Score: ${r.score.toFixed(2)}] ${r.uri}`);
			lines.push(`   ${r.snippet.slice(0, 200)}`);
			if (r.overview) {
				lines.push(`   Overview: ${r.overview.slice(0, 150)}...`);
			}
			lines.push('');
		}

		return lines.join('\n');
	}

	// ==================== After Turn ====================

	async afterTurn(params: {
		sessionId: string;
		sessionFile: string;
		messages: AgentMessage[];
		prePromptMessageCount: number;
		autoCompactionSummary?: string;
		isHeartbeat?: boolean;
		tokenBudget?: number;
		runtimeContext?: Record<string, unknown>;
		sessionKey?: string;
	}): Promise<void> {
		if (!this.config.autoCapture || params.isHeartbeat) {
			return;
		}

		const sessionKey = params.sessionKey ?? this.extractSessionKey(params.runtimeContext);
		const messages = params.messages ?? [];

		if (messages.length === 0) {
			return;
		}

		const buffer = this.getOrCreateBuffer(params.sessionId);
		const cortexSessionId = openClawSessionToCortexId(params.sessionId, sessionKey);

		// Batch write pending messages (single HTTP call with fallback)
		const batch = buffer.pendingMessages.splice(0);
		if (batch.length > 0) {
			try {
				const writeMessages = batch
					.map((msg) => {
						const content = this.extractMessageContent(msg);
						if (!content) return null;
						return {
							role: (msg.role as 'user' | 'assistant' | 'system') ?? 'user',
							content
						};
					})
					.filter((m): m is NonNullable<typeof m> => m !== null);

				if (writeMessages.length > 0) {
					const added = await this.client.addMessages(cortexSessionId, writeMessages);
					buffer.messageCount += added;
					this.logger.debug?.(
						`[context-engine] Batch wrote ${added}/${writeMessages.length} messages`
					);
				}
			} catch (err) {
				this.logger.warn(`[context-engine] Batch write failed: ${err}`);
				// Put messages back for retry next turn
				buffer.pendingMessages.unshift(...batch);
				return; // Don't evaluate commit if write failed
			}
		}

		// Evaluate commit trigger (local state, no API call)
		const shouldCommit = this.shouldTriggerCommit(buffer);

		if (shouldCommit) {
			this.triggerCommitAsync(cortexSessionId, buffer);
		}
	}

	/**
	 * Evaluate whether to trigger commit based on local state.
	 * No network calls needed.
	 */
	private shouldTriggerCommit(buffer: SessionBuffer): boolean {
		// Already committing — skip
		if (buffer.isCommitting) return false;

		// Token threshold
		if (buffer.pendingTokens >= this.config.commitTokenThreshold) {
			this.logger.debug?.(
				`[context-engine] Commit trigger: tokens=${Math.round(buffer.pendingTokens)}`
			);
			return true;
		}

		// Message count threshold
		if (buffer.messageCount >= this.config.commitTurnThreshold) {
			this.logger.debug?.(`[context-engine] Commit trigger: messages=${buffer.messageCount}`);
			return true;
		}

		// Time interval protection
		if (buffer.lastCommitAt) {
			const elapsed = Date.now() - buffer.lastCommitAt.getTime();
			if (elapsed >= this.config.commitIntervalMs) {
				this.logger.debug?.(
					`[context-engine] Commit trigger: interval=${Math.round(elapsed / 60000)}min`
				);
				return true;
			}
		}

		return false;
	}

	/**
	 * Trigger commit asynchronously (fire and forget).
	 * Does not block the current turn.
	 */
	private triggerCommitAsync(cortexSessionId: string, buffer: SessionBuffer): void {
		buffer.isCommitting = true;

		this.client
			.closeSession(cortexSessionId, false)
			.then((result) => {
				const memCount = Object.values(result.memories_extracted ?? {}).reduce((a, b) => a + b, 0);
				this.logger.info(
					`[context-engine] Commit completed: status=${result.status}, memories=${memCount}`
				);
			})
			.catch((err) => {
				this.logger.warn(`[context-engine] Commit failed: ${err}`);
			})
			.finally(() => {
				// Reset commit state
				buffer.isCommitting = false;
				buffer.lastCommitAt = new Date();
				buffer.pendingTokens = 0;
			});
	}

	private extractMessageContent(msg: AgentMessage): string {
		const content = msg.content;
		if (typeof content === 'string') {
			return content;
		}
		if (Array.isArray(content)) {
			return content
				.filter(
					(b): b is { type: 'text'; text: string } =>
						b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string'
				)
				.map((b) => b.text)
				.join('\n');
		}
		return '';
	}

	// ==================== Compact ====================

	/**
	 * Compact is delegated to OpenClaw runtime (ownsCompaction: false).
	 * This method is called by OpenClaw after it compacts the conversation.
	 * We use it as a signal to potentially close the session.
	 */
	async compact(params: {
		sessionId: string;
		sessionFile: string;
		tokenBudget?: number;
		force?: boolean;
		currentTokenCount?: number;
		compactionTarget?: 'budget' | 'threshold';
		customInstructions?: string;
		runtimeContext?: Record<string, unknown>;
	}): Promise<CompactResult> {
		const tokensBefore = params.currentTokenCount ?? -1;
		const sessionKey = this.extractSessionKey(params.runtimeContext);

		this.logger.info(`[context-engine] Compact called for session ${params.sessionId}`);

		try {
			const cortexSessionId = openClawSessionToCortexId(params.sessionId, sessionKey);
			const buffer = this.sessionBuffers.get(params.sessionId);

			// Flush pending messages directly (not via afterTurn which checks messages.length)
			if (buffer && buffer.pendingMessages.length > 0) {
				const flushBatch = buffer.pendingMessages.splice(0);
				try {
					const writeMessages = flushBatch
						.map((msg) => {
							const content = this.extractMessageContent(msg);
							if (!content) return null;
							return {
								role: (msg.role as 'user' | 'assistant' | 'system') ?? 'user',
								content
							};
						})
						.filter((m): m is NonNullable<typeof m> => m !== null);

					if (writeMessages.length > 0) {
						const added = await this.client.addMessages(cortexSessionId, writeMessages);
						buffer.messageCount += added;
						this.logger.debug?.(`[context-engine] Flushed ${added} pending messages before close`);
					}
				} catch (err) {
					this.logger.warn(`[context-engine] Failed to flush pending messages: ${err}`);
					// Put back for safety
					buffer.pendingMessages.unshift(...flushBatch);
				}
			}

			// Fire-and-forget close — don't block
			this.client
				.closeSession(cortexSessionId, false)
				.then((result) => {
					const memCount = Object.values(result.memories_extracted ?? {}).reduce(
						(a, b) => a + b,
						0
					);
					this.logger.info(
						`[context-engine] Session closed: ${result.status}, memories=${memCount}`
					);
				})
				.catch((err) => {
					this.logger.warn(`[context-engine] Session close failed: ${err}`);
				});

			// Clean up session buffer to prevent memory leak
			// Compact marks the end of a session lifecycle
			this.sessionBuffers.delete(params.sessionId);
			this.recallStates.delete(params.sessionId);

			return {
				ok: true,
				compacted: false, // OpenClaw handled compaction
				reason: 'delegated_to_runtime',
				result: { tokensBefore }
			};
		} catch (err) {
			this.logger.error(`[context-engine] Compact failed: ${err}`);
			return {
				ok: false,
				compacted: false,
				reason: 'error',
				result: { tokensBefore, details: { error: String(err) } }
			};
		}
	}

	// ==================== Helpers ====================

	private getOrCreateBuffer(sessionId: string): SessionBuffer {
		let buffer = this.sessionBuffers.get(sessionId);
		if (!buffer) {
			buffer = {
				sessionId,
				openClawSessionId: sessionId,
				pendingMessages: [],
				messageCount: 0,
				lastCommitAt: null,
				pendingTokens: 0,
				isCommitting: false
			};
			this.sessionBuffers.set(sessionId, buffer);
		}
		return buffer;
	}

	private extractSessionKey(runtimeContext?: Record<string, unknown>): string | undefined {
		if (!runtimeContext) return undefined;
		const key = runtimeContext.sessionKey;
		return typeof key === 'string' && key.trim() ? key.trim() : undefined;
	}
}

// ==================== Factory ====================

export function createContextEngine(
	config: ContextEngineConfig,
	client: CortexMemClient,
	logger: Logger
): ContextEngine {
	const info: ContextEngineInfo = {
		id: 'memclaw-context-engine',
		name: 'MemClaw Context Engine',
		version: '0.9.52',
		ownsCompaction: false // Delegated to OpenClaw runtime
	};

	return new ContextEngine(info, config, client, logger);
}

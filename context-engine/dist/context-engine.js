"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEngine = void 0;
exports.openClawSessionToCortexId = openClawSessionToCortexId;
exports.createContextEngine = createContextEngine;
const node_crypto_1 = require("node:crypto");
// ==================== Token Estimation ====================
/**
 * Simple token estimation: ~4 chars per token.
 * Good enough for thresholds; absolute accuracy not required.
 */
function estimateTokens(messages) {
    return Math.max(1, Math.ceil(JSON.stringify(messages).length / 4));
}
function estimateMessageChars(msg) {
    const raw = msg.content;
    if (typeof raw === 'string')
        return raw.length;
    if (Array.isArray(raw))
        return JSON.stringify(raw).length;
    return 1;
}
// ==================== Session ID Mapping ====================
const OPENCLAW_SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOWS_BAD_SESSION_SEGMENT = /[:<>"\\/|?\u0000-\u001f]/;
/**
 * Map OpenClaw session ID to Cortex session ID (safe for Windows paths)
 */
function openClawSessionToCortexId(sessionId, sessionKey) {
    const sid = typeof sessionId === 'string' ? sessionId.trim() : '';
    const key = typeof sessionKey === 'string' ? sessionKey.trim() : '';
    if (sid && OPENCLAW_SESSION_UUID.test(sid)) {
        return sid.toLowerCase();
    }
    if (key) {
        return (0, node_crypto_1.createHash)('sha256').update(key, 'utf8').digest('hex');
    }
    if (sid) {
        if (WINDOWS_BAD_SESSION_SEGMENT.test(sid)) {
            return (0, node_crypto_1.createHash)('sha256').update(`openclaw-session:${sid}`, 'utf8').digest('hex');
        }
        return sid;
    }
    throw new Error('Need sessionId or sessionKey for Cortex session path');
}
// ==================== Recall Query Construction ====================
function extractRecentUserTexts(messages, window) {
    const userTexts = [];
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
function isSimilarQuery(current, previous, threshold = 0.7) {
    if (!previous)
        return false;
    const a = current.toLowerCase().split(/\s+/);
    const b = previous.toLowerCase().split(/\s+/);
    let overlap = 0;
    for (const word of a) {
        if (word.length < 3)
            continue; // skip short words
        if (b.includes(word))
            overlap++;
    }
    const maxLen = Math.max(a.filter((w) => w.length >= 3).length, 1);
    return overlap / maxLen >= threshold;
}
// ==================== System Prompt Addition ====================
function buildSystemPromptAddition() {
    return `
## Memory Guide

Relevant memories from past conversations may appear as tool call results from \`cortex_search\`.
Use them for context, but trust the current conversation for exact details.
To search for more, use \`cortex_search\` or browse with \`cortex_ls\`.
`.trim();
}
// ==================== Context Engine Class ====================
class ContextEngine {
    info;
    config;
    client;
    logger;
    // Session buffers
    sessionBuffers = new Map();
    // Recall state (per-session, for cooldown + dedup)
    recallStates = new Map();
    constructor(info, config, client, logger) {
        this.info = info;
        this.config = config;
        this.client = client;
        this.logger = logger;
    }
    getInfo() {
        return this.info;
    }
    // ==================== Ingest ====================
    async ingest(params) {
        if (params.isHeartbeat) {
            return { ingested: false };
        }
        const buffer = this.getOrCreateBuffer(params.sessionId);
        buffer.pendingMessages.push(params.message);
        buffer.pendingTokens += estimateMessageChars(params.message) / 4;
        return { ingested: true };
    }
    // ==================== Assemble ====================
    async assemble(params) {
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
            const assembled = [...recallResult, ...params.messages];
            this.logger.info(`[context-engine] Assembled context: ${assembled.length} messages (recalled ${recallResult.length})`);
            return {
                messages: assembled,
                estimatedTokens: originalTokens + estimateTokens(recallResult),
                systemPromptAddition: buildSystemPromptAddition()
            };
        }
        catch (err) {
            this.logger.warn(`[context-engine] Assemble failed: ${err}`);
            return { messages: params.messages, estimatedTokens: originalTokens };
        }
    }
    async doAutoRecall(sessionId, messages) {
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
        }
        catch (err) {
            this.logger.warn(`[context-engine] Auto-recall failed: ${err}`);
            return null;
        }
    }
    formatRecallResults(results, query) {
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
    async afterTurn(params) {
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
                    if (!content)
                        return null;
                    return {
                        role: msg.role ?? 'user',
                        content
                    };
                })
                    .filter((m) => m !== null);
                if (writeMessages.length > 0) {
                    const added = await this.client.addMessages(cortexSessionId, writeMessages);
                    buffer.messageCount += added;
                    this.logger.debug?.(`[context-engine] Batch wrote ${added}/${writeMessages.length} messages`);
                }
            }
            catch (err) {
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
    shouldTriggerCommit(buffer) {
        // Already committing — skip
        if (buffer.isCommitting)
            return false;
        // Token threshold
        if (buffer.pendingTokens >= this.config.commitTokenThreshold) {
            this.logger.debug?.(`[context-engine] Commit trigger: tokens=${Math.round(buffer.pendingTokens)}`);
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
                this.logger.debug?.(`[context-engine] Commit trigger: interval=${Math.round(elapsed / 60000)}min`);
                return true;
            }
        }
        return false;
    }
    /**
     * Trigger commit asynchronously (fire and forget).
     * Does not block the current turn.
     */
    triggerCommitAsync(cortexSessionId, buffer) {
        buffer.isCommitting = true;
        this.client
            .closeSession(cortexSessionId, false)
            .then((result) => {
            const memCount = Object.values(result.memories_extracted ?? {}).reduce((a, b) => a + b, 0);
            this.logger.info(`[context-engine] Commit completed: status=${result.status}, memories=${memCount}`);
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
    extractMessageContent(msg) {
        const content = msg.content;
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .filter((b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
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
    async compact(params) {
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
                        if (!content)
                            return null;
                        return {
                            role: msg.role ?? 'user',
                            content
                        };
                    })
                        .filter((m) => m !== null);
                    if (writeMessages.length > 0) {
                        const added = await this.client.addMessages(cortexSessionId, writeMessages);
                        buffer.messageCount += added;
                        this.logger.debug?.(`[context-engine] Flushed ${added} pending messages before close`);
                    }
                }
                catch (err) {
                    this.logger.warn(`[context-engine] Failed to flush pending messages: ${err}`);
                    // Put back for safety
                    buffer.pendingMessages.unshift(...flushBatch);
                }
            }
            // Fire-and-forget close — don't block
            this.client
                .closeSession(cortexSessionId, false)
                .then((result) => {
                const memCount = Object.values(result.memories_extracted ?? {}).reduce((a, b) => a + b, 0);
                this.logger.info(`[context-engine] Session closed: ${result.status}, memories=${memCount}`);
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
        }
        catch (err) {
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
    getOrCreateBuffer(sessionId) {
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
    extractSessionKey(runtimeContext) {
        if (!runtimeContext)
            return undefined;
        const key = runtimeContext.sessionKey;
        return typeof key === 'string' && key.trim() ? key.trim() : undefined;
    }
}
exports.ContextEngine = ContextEngine;
// ==================== Factory ====================
function createContextEngine(config, client, logger) {
    const info = {
        id: 'memclaw-context-engine',
        name: 'MemClaw Context Engine',
        version: '0.9.53',
        ownsCompaction: false // Delegated to OpenClaw runtime
    };
    return new ContextEngine(info, config, client, logger);
}
//# sourceMappingURL=context-engine.js.map
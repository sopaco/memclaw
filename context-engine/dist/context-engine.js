"use strict";
/**
 * Context Engine Implementation
 *
 * Implements the OpenClaw Context Engine lifecycle:
 * - ingest: Receive messages into buffer
 * - assemble: Build context with auto-recall and session history
 * - afterTurn: Persist messages and evaluate commit triggers
 * - compact: Archive session and extract memories
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEngine = void 0;
exports.openClawSessionToCortexId = openClawSessionToCortexId;
exports.createContextEngine = createContextEngine;
const node_crypto_1 = require("node:crypto");
// =================--- Token Estimation ====================
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
// ==================== Message Conversion ====================
function convertToAgentMessages(msg) {
    const contentBlocks = [];
    const toolResults = [];
    const content = msg.content;
    if (typeof content === 'string') {
        return [{ role: msg.role, content }];
    }
    if (Array.isArray(content)) {
        for (const block of content) {
            if (block.type === 'text' && block.text) {
                contentBlocks.push({ type: 'text', text: block.text });
            }
            else if (block.type === 'toolUse' && block.id && block.name) {
                contentBlocks.push({
                    type: 'toolUse',
                    id: block.id,
                    name: block.name,
                    input: block.input
                });
                // Tool result handling would go here if we had the result data
            }
            else if (block.type === 'toolResult' && block.toolCallId) {
                toolResults.push({
                    role: 'toolResult',
                    toolCallId: block.toolCallId,
                    content: block.content,
                    isError: block.isError
                });
            }
        }
    }
    const result = [];
    if (msg.role === 'assistant') {
        result.push({ role: msg.role, content: contentBlocks });
        result.push(...toolResults);
    }
    else {
        const texts = contentBlocks
            .filter((b) => b.type === 'text')
            .map((b) => b.text);
        result.push({ role: msg.role, content: texts.join('\n') || '' });
    }
    return result;
}
function normalizeAssistantContent(messages) {
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg?.role === 'assistant' && typeof msg.content === 'string') {
            messages[i] = {
                ...msg,
                content: [{ type: 'text', text: msg.content }],
            };
        }
    }
}
// ==================== Recall Query Construction ====================
function extractRecentUserTexts(messages, window) {
    const userTexts = [];
    // Go backwards from the end to find recent user messages
    for (let i = messages.length - 1; i >= 0 && userTexts.length < window; i--) {
        const msg = messages[i];
        if (msg?.role === 'user') {
            const content = msg.content;
            if (typeof content === 'string' && content.trim()) {
                // Skip very short messages (greetings, etc.)
                if (content.trim().length > 10) {
                    userTexts.unshift(content.trim().slice(0, 500));
                }
            }
        }
    }
    return userTexts;
}
// ==================== System Prompt Addition ====================
function buildSystemPromptAddition() {
    return `
## Session Context Guide

Your conversation history may include:

1. **[Session History Summary]** — A compressed summary of prior sessions.
   Specific details (commands, paths, code) may have been compressed away.

2. **[Archive Index]** — A list of archive entries in chronological order.
   archive_001 is oldest, higher numbers are more recent.

3. **Auto Recall Results** — Relevant memories retrieved based on context.
   Shown as simulated tool call results.

4. **Active messages** — The current, uncompressed conversation.

**When you need precise details from a prior session:**

1. Review [Archive Index] to identify which archive likely contains the info.
2. Call \`cortex_archive_expand\` with that archive ID.
3. Answer using the retrieved content together with active messages.

**Rules:**
- If active messages conflict with archive/memory content, trust active messages.
- Only expand an archive when existing context lacks specific detail.
- Do not fabricate details from summaries. When uncertain, expand first.
- After expanding, cite the archive ID in your answer.
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
        // Get or create buffer
        const buffer = this.getOrCreateBuffer(params.sessionId);
        // Add to pending messages
        buffer.pendingMessages.push(params.message);
        buffer.totalChars += estimateMessageChars(params.message);
        buffer.lastWriteAt = new Date();
        this.logger.debug?.(`[context-engine] Ingested message for session ${params.sessionId}`);
        return { ingested: true };
    }
    // ==================== Assemble ====================
    async assemble(params) {
        const tokenBudget = params.tokenBudget ?? 128000;
        const sessionKey = params.sessionKey ?? this.extractSessionKey(params.runtimeContext);
        const originalTokens = estimateTokens(params.messages);
        this.logger.debug?.(`[context-engine] Assemble for session ${params.sessionId}, budget=${tokenBudget}`);
        try {
            // Get Cortex session ID
            const cortexSessionId = openClawSessionToCortexId(params.sessionId, sessionKey);
            // Get session context from cortex-mem-service
            const ctx = await this.client.getSessionContext(cortexSessionId, tokenBudget);
            const hasArchives = !!ctx.latest_archive_overview || ctx.pre_archive_abstracts.length > 0;
            const activeCount = ctx.messages.length;
            // If no context data, return original messages
            if (!ctx || (!hasArchives && activeCount === 0)) {
                this.logger.debug?.(`[context-engine] No context data, returning original messages`);
                return { messages: params.messages, estimatedTokens: originalTokens };
            }
            // Build assembled messages
            const assembled = [];
            // 1. Session History Summary
            if (ctx.latest_archive_overview) {
                assembled.push({
                    role: 'user',
                    content: `[Session History Summary]\n${ctx.latest_archive_overview}`
                });
            }
            // 2. Archive Index
            if (ctx.pre_archive_abstracts.length > 0) {
                const lines = ctx.pre_archive_abstracts.map((a) => `${a.archive_id}: ${a.abstract}`);
                assembled.push({
                    role: 'user',
                    content: `[Archive Index]\n${lines.join('\n')}`
                });
            }
            // 3. Auto Recall (if enabled)
            if (this.config.autoRecall) {
                const recallResult = await this.doAutoRecall(params.messages, tokenBudget);
                if (recallResult) {
                    assembled.push(...recallResult);
                }
            }
            // 4. Active messages from context
            assembled.push(...ctx.messages.flatMap((m) => convertToAgentMessages(m)));
            // 5. Normalize and return
            normalizeAssistantContent(assembled);
            const estimatedTokens = ctx.estimatedTokens;
            this.logger.info(`[context-engine] Assembled context: ${assembled.length} messages, ` +
                `archives=${ctx.pre_archive_abstracts.length}, ` +
                `tokens=${estimatedTokens}`);
            return {
                messages: assembled,
                estimatedTokens,
                systemPromptAddition: hasArchives ? buildSystemPromptAddition() : undefined
            };
        }
        catch (err) {
            this.logger.warn(`[context-engine] Assemble failed: ${err}`);
            // Fallback to original messages
            return { messages: params.messages, estimatedTokens: originalTokens };
        }
    }
    async doAutoRecall(messages, tokenBudget) {
        // Extract recent user texts for query
        const userTexts = extractRecentUserTexts(messages, this.config.recallWindow);
        if (userTexts.length === 0) {
            return null;
        }
        const query = userTexts.join(' ');
        try {
            this.logger.debug?.(`[context-engine] Auto-recall query: ${query.slice(0, 100)}...`);
            // Search across user and agent memories
            const results = await this.client.search({
                query,
                limit: this.config.recallLimit,
                min_score: this.config.recallMinScore,
                return_layers: ['L0', 'L1'] // Use abstract and overview for efficiency
            });
            if (results.length === 0) {
                return null;
            }
            // Format as simulated tool call
            const recallContent = this.formatRecallResults(results, query);
            return [
                {
                    role: 'assistant',
                    content: [{
                            type: 'toolUse',
                            id: 'auto-recall-001',
                            name: 'cortex_search',
                            input: { query }
                        }]
                },
                {
                    role: 'toolResult',
                    toolCallId: 'auto-recall-001',
                    content: recallContent
                }
            ];
        }
        catch (err) {
            this.logger.warn(`[context-engine] Auto-recall failed: ${err}`);
            return null;
        }
    }
    formatRecallResults(results, query) {
        const lines = [`Found ${results.length} relevant memories for "${query.slice(0, 50)}...":\n`];
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
        if (!this.config.autoCapture) {
            return;
        }
        const sessionKey = params.sessionKey ?? this.extractSessionKey(params.runtimeContext);
        const messages = params.messages ?? [];
        if (messages.length === 0) {
            return;
        }
        // Extract new messages
        const start = typeof params.prePromptMessageCount === 'number' && params.prePromptMessageCount >= 0
            ? params.prePromptMessageCount
            : 0;
        const newMessages = messages.slice(start).filter((m) => {
            const r = m.role;
            return r === 'user' || r === 'assistant';
        });
        if (newMessages.length === 0) {
            return;
        }
        try {
            const cortexSessionId = openClawSessionToCortexId(params.sessionId, sessionKey);
            // Write new messages to session
            for (const msg of newMessages) {
                const content = this.extractMessageContent(msg);
                if (content) {
                    await this.client.addMessage(cortexSessionId, {
                        role: msg.role ?? 'user',
                        content
                    });
                }
            }
            this.logger.debug?.(`[context-engine] Wrote ${newMessages.length} messages to session ${cortexSessionId}`);
            // Check if we should trigger commit
            const session = await this.client.getSession(cortexSessionId);
            const pendingTokens = session.pending_tokens ?? 0;
            const messageCount = session.message_count ?? 0;
            const shouldCommit = pendingTokens >= this.config.commitTokenThreshold ||
                messageCount >= this.config.commitTurnThreshold;
            if (shouldCommit) {
                this.logger.info(`[context-engine] Triggering commit for session ${cortexSessionId} ` +
                    `(tokens=${pendingTokens}, messages=${messageCount})`);
                // Async commit - don't wait
                this.client.commitSession(cortexSessionId, { wait: false })
                    .then(result => {
                    this.logger.info(`[context-engine] Commit result: ${result.status}`);
                })
                    .catch(err => {
                    this.logger.warn(`[context-engine] Commit failed: ${err}`);
                });
            }
        }
        catch (err) {
            this.logger.warn(`[context-engine] afterTurn failed: ${err}`);
        }
    }
    extractMessageContent(msg) {
        const content = msg.content;
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .filter((b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
                .map(b => b.text)
                .join('\n');
        }
        return '';
    }
    // ==================== Compact ====================
    async compact(params) {
        const tokenBudget = params.tokenBudget ?? 128000;
        const tokensBefore = params.currentTokenCount ?? -1;
        this.logger.info(`[context-engine] Compact for session ${params.sessionId}`);
        try {
            // Get Cortex session ID
            const cortexSessionId = openClawSessionToCortexId(params.sessionId, undefined);
            // Commit session (synchronous)
            const result = await this.client.commitSession(cortexSessionId, { wait: true });
            if (result.status === 'failed') {
                return {
                    ok: false,
                    compacted: false,
                    reason: 'commit_failed',
                    result: { tokensBefore, details: { error: result.error } }
                };
            }
            if (result.status === 'timeout') {
                return {
                    ok: false,
                    compacted: false,
                    reason: 'commit_timeout',
                    result: { tokensBefore, details: { taskId: result.task_id } }
                };
            }
            // Get updated context
            const ctx = await this.client.getSessionContext(cortexSessionId, tokenBudget);
            this.logger.info(`[context-engine] Compact completed: archived=${result.archived}, ` +
                `memories=${Object.values(result.memories_extracted ?? {}).reduce((a, b) => a + b, 0)}`);
            return {
                ok: true,
                compacted: result.archived ?? false,
                reason: 'commit_completed',
                result: {
                    summary: ctx.latest_archive_overview,
                    tokensBefore,
                    tokensAfter: ctx.estimatedTokens,
                    details: {
                        archiveId: result.archive_id,
                        memoriesExtracted: result.memories_extracted
                    }
                }
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
                totalChars: 0,
                messageCount: 0,
                lastWriteAt: new Date(),
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
        version: '0.1.0',
        ownsCompaction: true
    };
    return new ContextEngine(info, config, client, logger);
}
//# sourceMappingURL=context-engine.js.map
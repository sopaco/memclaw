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
import { CortexMemClient } from './client.js';
import type { ContextEngineConfig } from './config.js';
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
/**
 * Map OpenClaw session ID to Cortex session ID (safe for Windows paths)
 */
export declare function openClawSessionToCortexId(sessionId: string | undefined, sessionKey: string | undefined): string;
export declare class ContextEngine {
    private info;
    private config;
    private client;
    private logger;
    private sessionBuffers;
    private recallStates;
    constructor(info: ContextEngineInfo, config: ContextEngineConfig, client: CortexMemClient, logger: Logger);
    getInfo(): ContextEngineInfo;
    ingest(params: {
        sessionId: string;
        message: AgentMessage;
        isHeartbeat?: boolean;
    }): Promise<IngestResult>;
    assemble(params: {
        sessionId: string;
        sessionKey?: string;
        messages: AgentMessage[];
        tokenBudget?: number;
        runtimeContext?: Record<string, unknown>;
    }): Promise<AssembleResult>;
    private doAutoRecall;
    private formatRecallResults;
    afterTurn(params: {
        sessionId: string;
        sessionFile: string;
        messages: AgentMessage[];
        prePromptMessageCount: number;
        autoCompactionSummary?: string;
        isHeartbeat?: boolean;
        tokenBudget?: number;
        runtimeContext?: Record<string, unknown>;
        sessionKey?: string;
    }): Promise<void>;
    /**
     * Evaluate whether to trigger commit based on local state.
     * No network calls needed.
     */
    private shouldTriggerCommit;
    /**
     * Trigger commit asynchronously (fire and forget).
     * Does not block the current turn.
     */
    private triggerCommitAsync;
    private extractMessageContent;
    /**
     * Compact is delegated to OpenClaw runtime (ownsCompaction: false).
     * This method is called by OpenClaw after it compacts the conversation.
     * We use it as a signal to potentially close the session.
     */
    compact(params: {
        sessionId: string;
        sessionFile: string;
        tokenBudget?: number;
        force?: boolean;
        currentTokenCount?: number;
        compactionTarget?: 'budget' | 'threshold';
        customInstructions?: string;
        runtimeContext?: Record<string, unknown>;
    }): Promise<CompactResult>;
    private getOrCreateBuffer;
    private extractSessionKey;
}
export declare function createContextEngine(config: ContextEngineConfig, client: CortexMemClient, logger: Logger): ContextEngine;
//# sourceMappingURL=context-engine.d.ts.map
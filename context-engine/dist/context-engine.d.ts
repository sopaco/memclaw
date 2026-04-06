/**
 * Context Engine Implementation
 *
 * Implements the OpenClaw Context Engine lifecycle:
 * - ingest: Receive messages into buffer
 * - assemble: Build context with auto-recall and session history
 * - afterTurn: Persist messages and evaluate commit triggers
 * - compact: Archive session and extract memories
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
    ownsCompaction: true;
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
    private extractMessageContent;
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
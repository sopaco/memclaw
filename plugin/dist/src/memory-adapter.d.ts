/**
 * Memory Adapter for OpenClaw
 *
 * Adapts CortexMemClient to OpenClaw's MemoryPluginCapability interface.
 * This allows MemClaw to function as a native OpenClaw memory plugin.
 */
import { CortexMemClient } from './client.js';
export type MemorySource = 'memory' | 'sessions';
export type MemorySearchResult = {
    path: string;
    startLine: number;
    endLine: number;
    score: number;
    snippet: string;
    source: MemorySource;
    citation?: string;
};
export type MemoryEmbeddingProbeResult = {
    ok: boolean;
    error?: string;
};
export type MemorySyncProgressUpdate = {
    completed: number;
    total: number;
    label?: string;
};
export type MemoryProviderStatus = {
    backend: 'builtin' | 'cortex';
    provider: string;
    model?: string;
    requestedProvider?: string;
    files?: number;
    chunks?: number;
    dirty?: boolean;
    workspaceDir?: string;
    dbPath?: string;
    extraPaths?: string[];
    sources?: MemorySource[];
    sourceCounts?: Array<{
        source: MemorySource;
        files: number;
        chunks: number;
    }>;
    cache?: {
        enabled: boolean;
        entries?: number;
        maxEntries?: number;
    };
    fts?: {
        enabled: boolean;
        available: boolean;
        error?: string;
    };
    fallback?: {
        from: string;
        reason?: string;
    };
    vector?: {
        enabled: boolean;
        available?: boolean;
        extensionPath?: string;
        loadError?: string;
        dims?: number;
    };
    batch?: {
        enabled: boolean;
        failures: number;
        limit: number;
        wait: boolean;
        concurrency: number;
        pollIntervalMs: number;
        timeoutMs: number;
        lastError?: string;
        lastProvider?: string;
    };
    custom?: Record<string, unknown>;
};
/**
 * MemorySearchManager interface compatible with OpenClaw
 */
export interface MemorySearchManager {
    search(query: string, opts?: {
        maxResults?: number;
        minScore?: number;
        sessionKey?: string;
    }): Promise<MemorySearchResult[]>;
    readFile(params: {
        relPath: string;
        from?: number;
        lines?: number;
    }): Promise<{
        text: string;
        path: string;
    }>;
    status(): MemoryProviderStatus;
    sync?(params?: {
        reason?: string;
        force?: boolean;
        progress?: (update: MemorySyncProgressUpdate) => void;
    }): Promise<void>;
    probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult>;
    probeVectorAvailability(): Promise<boolean>;
    close?(): Promise<void>;
}
export type MemoryFlushPlan = {
    softThresholdTokens: number;
    forceFlushTranscriptBytes: number;
    reserveTokensFloor: number;
    prompt: string;
    systemPrompt: string;
    relativePath: string;
};
export type MemoryCitationsMode = 'auto' | 'on' | 'off';
export type MemoryRuntimeBackendConfig = {
    backend: 'builtin' | 'cortex';
};
/**
 * Adapts CortexMemClient to OpenClaw's MemorySearchManager interface.
 *
 * This allows MemClaw to be used as a drop-in replacement for OpenClaw's
 * built-in memory search, enabling seamless integration with the memory slot.
 */
export declare class CortexMemorySearchManager implements MemorySearchManager {
    private client;
    private tenantId;
    private defaultSessionKey;
    private _status;
    private _closed;
    /** Check if the manager has been closed */
    get closed(): boolean;
    constructor(options: {
        client: CortexMemClient;
        tenantId: string;
        defaultSessionKey?: string;
    });
    /**
     * Search memories using Cortex Memory's tiered retrieval.
     *
     * Converts Cortex search results to OpenClaw's MemorySearchResult format.
     */
    search(query: string, opts?: {
        maxResults?: number;
        minScore?: number;
        sessionKey?: string;
    }): Promise<MemorySearchResult[]>;
    /**
     * Read a memory file by path.
     *
     * Uses Cortex's filesystem API to read content.
     */
    readFile(params: {
        relPath: string;
        from?: number;
        lines?: number;
    }): Promise<{
        text: string;
        path: string;
    }>;
    /**
     * Return the current memory provider status.
     */
    status(): MemoryProviderStatus;
    /**
     * Sync is handled automatically by Cortex Memory service.
     * This is a no-op for compatibility.
     */
    sync?(params?: {
        reason?: string;
        force?: boolean;
        progress?: (update: MemorySyncProgressUpdate) => void;
    }): Promise<void>;
    /**
     * Check if embedding service is available.
     */
    probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult>;
    /**
     * Check if vector search is available.
     */
    probeVectorAvailability(): Promise<boolean>;
    /**
     * Close the manager and release resources.
     */
    close(): Promise<void>;
    /**
     * Map OpenClaw sessionKey to Cortex scope URI.
     */
    private resolveScope;
    /**
     * Convert Cortex SearchResult to OpenClaw MemorySearchResult.
     */
    private toMemorySearchResult;
    /**
     * Convert Cortex URI to relative file path.
     */
    private uriToPath;
    /**
     * Convert relative path to Cortex URI.
     */
    private toCortexUri;
    /**
     * Infer memory source from URI.
     */
    private inferSource;
}
/**
 * Get or create a memory search manager for an agent.
 */
export declare function getMemorySearchManager(params: {
    serviceUrl: string;
    tenantId: string;
    agentId: string;
    sessionKey?: string;
}): Promise<{
    manager: MemorySearchManager | null;
    error?: string;
}>;
/**
 * Close all active memory managers.
 */
export declare function closeAllMemorySearchManagers(): Promise<void>;
/**
 * Build the system prompt section for memory guidance.
 */
export type MemoryPromptSectionBuilder = (params: {
    availableTools: Set<string>;
    citationsMode?: MemoryCitationsMode;
}) => string[];
/**
 * Resolve the memory flush plan for compaction.
 */
export type MemoryFlushPlanResolver = (params: {
    cfg?: unknown;
    nowMs?: number;
}) => MemoryFlushPlan | null;
/**
 * Memory plugin runtime interface.
 */
export type MemoryPluginRuntime = {
    getMemorySearchManager(params: {
        cfg: unknown;
        agentId: string;
        purpose?: 'default' | 'status';
    }): Promise<{
        manager: MemorySearchManager | null;
        error?: string;
    }>;
    resolveMemoryBackendConfig(params: {
        cfg: unknown;
        agentId: string;
    }): MemoryRuntimeBackendConfig;
    closeAllMemorySearchManagers?(): Promise<void>;
};
/**
 * Public artifacts provider for memory data export.
 */
export type MemoryPluginPublicArtifactsProvider = {
    listArtifacts(params: {
        cfg: unknown;
    }): Promise<MemoryPluginPublicArtifact[]>;
};
export type MemoryPluginPublicArtifact = {
    uri: string;
    name: string;
    kind: 'file' | 'directory';
    size?: number;
    modified?: number;
};
/**
 * Complete memory plugin capability for registerMemoryCapability.
 */
export type MemoryPluginCapability = {
    promptBuilder?: MemoryPromptSectionBuilder;
    flushPlanResolver?: MemoryFlushPlanResolver;
    runtime?: MemoryPluginRuntime;
    publicArtifacts?: MemoryPluginPublicArtifactsProvider;
};
/**
 * Create the MemoryPluginCapability object for registerMemoryCapability.
 */
export declare function createMemoryPluginCapability(options: {
    serviceUrl: string;
    tenantId: string;
}): MemoryPluginCapability;
//# sourceMappingURL=memory-adapter.d.ts.map
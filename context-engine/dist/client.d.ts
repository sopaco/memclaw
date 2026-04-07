/**
 * Cortex Mem Client for Context Engine
 *
 * HTTP client for cortex-mem-service REST API.
 * Optimized for minimal token consumption:
 * - Batch message writes
 * - No polling or unnecessary API calls
 */
/** Layer types */
export type Layer = 'L0' | 'L1' | 'L2';
export interface SearchOptions {
    query: string;
    /** URI prefix to limit search scope */
    scope?: string;
    limit?: number;
    min_score?: number;
    /** Which layers to return */
    return_layers?: Layer[];
}
export interface SearchResult {
    uri: string;
    score: number;
    snippet: string;
    overview?: string;
    content?: string;
    source: string;
    layers: Layer[];
}
export interface LsOptions {
    uri?: string;
    recursive?: boolean;
    include_abstracts?: boolean;
}
export interface LsEntry {
    uri: string;
    name: string;
    is_directory: boolean;
    size: number;
    modified: string;
    abstract_text?: string;
}
export interface LsResponse {
    uri: string;
    total: number;
    entries: LsEntry[];
}
export interface LayerResponse {
    uri: string;
    content: string;
    layer: Layer;
    token_count: number;
}
export interface SessionInfo {
    thread_id: string;
    status: string;
    message_count: number;
    created_at: string;
    updated_at: string;
}
export interface AddMessageOptions {
    content: string;
    role?: 'user' | 'assistant' | 'system';
    metadata?: Record<string, unknown>;
}
export interface CommitSessionResult {
    thread_id: string;
    status: 'accepted' | 'completed' | 'failed' | 'timeout';
    message_count: number;
    task_id?: string;
    archive_id?: string;
    archive_uri?: string;
    archived?: boolean;
    memories_extracted?: Record<string, number>;
    error?: string;
}
export declare class CortexMemClient {
    private baseUrl;
    private timeoutMs;
    constructor(baseUrl?: string, timeoutMs?: number);
    search(options: SearchOptions): Promise<SearchResult[]>;
    recall(query: string, scope?: string, limit?: number): Promise<SearchResult[]>;
    ls(options?: LsOptions): Promise<LsResponse>;
    getAbstract(uri: string): Promise<LayerResponse>;
    getOverview(uri: string): Promise<LayerResponse>;
    getContent(uri: string): Promise<LayerResponse>;
    addMessage(threadId: string, message: AddMessageOptions): Promise<string>;
    /**
     * Batch write messages to session timeline.
     * Single HTTP call instead of N individual calls.
     */
    addMessages(threadId: string, messages: AddMessageOptions[]): Promise<number>;
    /**
     * Close session to trigger memory extraction.
     * Non-blocking by default - fire and forget.
     */
    closeSession(threadId: string, wait?: boolean): Promise<CommitSessionResult>;
    switchTenant(tenantId: string): Promise<void>;
    deleteUri(uri: string): Promise<void>;
    healthCheck(): Promise<boolean>;
    private fetchJson;
}
//# sourceMappingURL=client.d.ts.map
/**
 * Cortex Mem Client for Context Engine
 *
 * Extended HTTP client for cortex-mem-service REST API with Context Engine support.
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
    pending_tokens?: number;
    last_commit_at?: string;
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
export interface SessionContextResult {
    latest_archive_overview: string;
    pre_archive_abstracts: PreArchiveAbstract[];
    messages: ContextMessage[];
    estimatedTokens: number;
    stats: {
        totalArchives: number;
        includedArchives: number;
        activeTokens: number;
        archiveTokens: number;
    };
}
export interface PreArchiveAbstract {
    archive_id: string;
    abstract: string;
}
export interface ContextMessage {
    id: string;
    role: string;
    content: string | ContentBlock[];
    created_at: string;
}
export interface ContentBlock {
    type: 'text' | 'toolUse' | 'toolResult';
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
    toolCallId?: string;
    content?: ContentBlock[];
    isError?: boolean;
}
export interface SessionArchiveResult {
    archive_id: string;
    abstract: string;
    overview: string;
    messages: ContextMessage[];
}
export interface ArchiveMessage {
    id: string;
    role: string;
    parts: MessagePart[];
    created_at: string;
}
export interface MessagePart {
    type: 'text' | 'tool' | 'context';
    text?: string;
    tool_id?: string;
    tool_name?: string;
    tool_input?: unknown;
    tool_output?: string;
    tool_status?: string;
    uri?: string;
    abstract?: string;
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
    getSession(threadId: string): Promise<SessionInfo>;
    addMessage(threadId: string, message: AddMessageOptions): Promise<string>;
    commitSession(threadId: string, options?: {
        wait?: boolean;
        timeoutMs?: number;
    }): Promise<CommitSessionResult>;
    private pollCommitCompletion;
    getTask(taskId: string): Promise<{
        status: string;
        result?: {
            memories_extracted?: Record<string, number>;
        };
        error?: string;
    }>;
    getSessionContext(sessionId: string, tokenBudget?: number): Promise<SessionContextResult>;
    getSessionArchive(sessionId: string, archiveId: string): Promise<SessionArchiveResult>;
    switchTenant(tenantId: string): Promise<void>;
    deleteUri(uri: string): Promise<void>;
    healthCheck(): Promise<boolean>;
    private fetchJson;
    private sleep;
}
//# sourceMappingURL=client.d.ts.map
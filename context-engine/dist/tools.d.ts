/**
 * Tool Definitions for MemClaw Context Engine
 */
import type { CortexMemClient } from './client.js';
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: object;
    execute: (_id: string, params: Record<string, unknown>) => Promise<unknown>;
}
export interface ToolContext {
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
}
type PluginLogger = {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
};
export declare function createTools(client: CortexMemClient, config: {
    defaultSessionId: string;
    searchLimit: number;
    minScore: number;
    tenantId: string;
}, logger: PluginLogger): Map<string, ToolDefinition>;
export {};
//# sourceMappingURL=tools.d.ts.map
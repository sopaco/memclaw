/**
 * Tool Definitions for MemClaw Context Engine
 *
 * Tools available for explicit model invocation.
 * The Context Engine handles automatic recall; these tools are for manual operations.
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
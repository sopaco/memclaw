/**
 * MemClaw Context Engine - OpenClaw Plugin Entry Point
 *
 * This plugin provides native context management for OpenClaw with:
 * - Automatic memory recall during context assembly
 * - Automatic message capture after each turn
 * - Intelligent compaction with memory extraction
 * - Archive expansion for retrieving compressed history
 */
type PluginLogger = {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
};
type ToolDefinition = {
    name: string;
    description: string;
    parameters: object;
    execute: (_id: string, params: Record<string, unknown>) => Promise<unknown>;
};
type OpenClawPluginApi = {
    pluginConfig?: unknown;
    logger: PluginLogger;
    registerTool: {
        (tool: ToolDefinition, opts?: {
            name?: string;
            names?: string[];
        }): void;
        (factory: (ctx: unknown) => ToolDefinition, opts?: {
            name?: string;
            names?: string[];
        }): void;
    };
    registerService: (service: {
        id: string;
        start: (ctx?: unknown) => void | Promise<void>;
        stop?: (ctx?: unknown) => void | Promise<void>;
    }) => void;
    registerContextEngine?: (id: string, factory: () => unknown) => void;
};
export declare function createPlugin(api: OpenClawPluginApi): void;
export { CortexMemClient } from './client.js';
export { createContextEngine, openClawSessionToCortexId } from './context-engine.js';
export { createTools } from './tools.js';
export { parsePluginConfig, getDefaultContextEngineConfig, type ContextEngineConfig } from './config.js';
export * from './binaries.js';
export declare function register(api: OpenClawPluginApi): void;
declare const _default: {
    createPlugin: typeof createPlugin;
    register: typeof register;
};
export default _default;
//# sourceMappingURL=index.d.ts.map
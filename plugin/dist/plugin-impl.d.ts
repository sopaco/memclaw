/**
 * MemClaw Plugin Implementation
 *
 * Provides layered semantic memory for OpenClaw with:
 * - Automatic service startup
 * - Memory tools (search, recall, add, close)
 * - Tiered access (L0/L1/L2)
 * - Filesystem browsing
 * - Smart exploration
 * - Migration from OpenClaw native memory
 */
import { type MemoryPluginCapability, type MemoryPromptSectionBuilder, type MemoryFlushPlanResolver, type MemoryPluginRuntime } from './src/memory-adapter.js';
interface PluginLogger {
    debug?: (msg: string, ...args: unknown[]) => void;
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
}
interface PluginAPI {
    pluginConfig?: Record<string, unknown>;
    registerTool(tool: ToolDefinition, opts?: {
        optional?: boolean;
    }): void;
    registerService(service: {
        id: string;
        start: () => Promise<void>;
        stop: () => Promise<void>;
    }): void;
    registerHook?: (event: 'before_install' | 'after_install' | 'before_uninstall' | 'after_uninstall' | 'on_config_change', handler: (context: {
        pluginId: string;
    }) => Promise<{
        block?: boolean;
        message?: string;
    }>, opt: {
        name: string;
    }) => void;
    updateConfig?: (updates: Record<string, unknown>) => Promise<void>;
    logger: PluginLogger;
    /** Register memory capability (modern recommended API for memory plugins) */
    registerMemoryCapability?: (capability: MemoryPluginCapability) => void;
    /** @deprecated Legacy - use registerMemoryCapability instead */
    registerMemoryPromptSection?: (builder: MemoryPromptSectionBuilder) => void;
    /** @deprecated Legacy - use registerMemoryCapability instead */
    registerMemoryFlushPlan?: (resolver: MemoryFlushPlanResolver) => void;
    /** @deprecated Legacy - use registerMemoryCapability instead */
    registerMemoryRuntime?: (runtime: MemoryPluginRuntime) => void;
}
interface ToolDefinition {
    name: string;
    description: string;
    parameters: object;
    execute: (_id: string, params: Record<string, unknown>) => Promise<unknown>;
    optional?: boolean;
}
export declare function createPlugin(api: PluginAPI): {
    id: string;
    name: string;
    version: string;
};
export {};
//# sourceMappingURL=plugin-impl.d.ts.map
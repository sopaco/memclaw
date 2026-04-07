/**
 * Configuration management for MemClaw Context Engine
 */
export declare function getDataDir(): string;
export declare function getConfigPath(): string;
export interface ContextEngineConfig {
    serviceUrl: string;
    tenantId: string;
    defaultSessionId: string;
    autoStartServices: boolean;
    autoRecall: boolean;
    recallWindow: number;
    recallLimit: number;
    recallMinScore: number;
    autoCapture: boolean;
    commitTokenThreshold: number;
    commitTurnThreshold: number;
    commitIntervalMs: number;
}
export declare function getDefaultContextEngineConfig(): ContextEngineConfig;
export declare function parsePluginConfig(rawConfig: Record<string, unknown>): ContextEngineConfig;
export declare function generateConfigTemplate(): string;
export declare function ensureConfigExists(): {
    created: boolean;
    path: string;
};
export declare function openConfigFile(configPath: string): Promise<void>;
//# sourceMappingURL=config.d.ts.map
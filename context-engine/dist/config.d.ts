/**
 * Configuration management for MemClaw Context Engine
 */
export declare function getDataDir(): string;
export declare function getConfigPath(): string;
export interface MemClawConfig {
    qdrant: {
        url: string;
        collection_name: string;
        embedding_dim?: number;
        timeout_secs: number;
    };
    llm: {
        api_base_url: string;
        api_key: string;
        model_efficient: string;
        temperature: number;
        max_tokens: number;
    };
    embedding: {
        api_base_url: string;
        api_key: string;
        model_name: string;
        batch_size: number;
        timeout_secs: number;
    };
    server: {
        host: string;
        port: number;
        cors_origins?: string[];
    };
    logging: {
        enabled: boolean;
        log_directory: string;
        level: string;
    };
    cortex: {
        enable_intent_analysis: boolean;
    };
}
export interface ContextEngineConfig {
    serviceUrl: string;
    tenantId: string;
    defaultSessionId: string;
    autoStartServices: boolean;
    autoRecall: boolean;
    recallWindow: number;
    recallLimit: number;
    recallMinScore: number;
    recallTokenBudget: number;
    autoCapture: boolean;
    commitTokenThreshold: number;
    commitTurnThreshold: number;
    recentRawTurnCount: number;
    llmApiBaseUrl?: string;
    llmApiKey?: string;
    llmModel?: string;
    embeddingApiBaseUrl?: string;
    embeddingApiKey?: string;
    embeddingModel?: string;
}
export declare function getDefaultContextEngineConfig(): ContextEngineConfig;
export declare function parsePluginConfig(rawConfig: Record<string, unknown>): ContextEngineConfig;
export declare function generateConfigTemplate(): string;
export declare function ensureConfigExists(): {
    created: boolean;
    path: string;
};
export declare function openConfigFile(configPath: string): Promise<void>;
export declare function parseConfig(configPath: string): MemClawConfig;
export declare function validateConfig(config: MemClawConfig): {
    valid: boolean;
    errors: string[];
};
export interface PluginProvidedConfig {
    llmApiBaseUrl?: string;
    llmApiKey?: string;
    llmModel?: string;
    embeddingApiBaseUrl?: string;
    embeddingApiKey?: string;
    embeddingModel?: string;
}
export declare function updateConfigFromPlugin(pluginConfig: PluginProvidedConfig): {
    updated: boolean;
    path: string;
};
export declare function mergeConfigWithPlugin(fileConfig: MemClawConfig, pluginConfig: PluginProvidedConfig): MemClawConfig;
//# sourceMappingURL=config.d.ts.map
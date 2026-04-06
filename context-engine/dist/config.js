"use strict";
/**
 * Configuration management for MemClaw Context Engine
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataDir = getDataDir;
exports.getConfigPath = getConfigPath;
exports.getDefaultContextEngineConfig = getDefaultContextEngineConfig;
exports.parsePluginConfig = parsePluginConfig;
exports.generateConfigTemplate = generateConfigTemplate;
exports.ensureConfigExists = ensureConfigExists;
exports.openConfigFile = openConfigFile;
exports.parseConfig = parseConfig;
exports.validateConfig = validateConfig;
exports.updateConfigFromPlugin = updateConfigFromPlugin;
exports.mergeConfigWithPlugin = mergeConfigWithPlugin;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const smol_toml_1 = __importDefault(require("smol-toml"));
// ==================== Paths ====================
function getDataDir() {
    const platform = process.platform;
    if (platform === 'win32') {
        return path.join(process.env.LOCALAPPAL || path.join(os.homedir(), 'AppData', 'Local'), 'memclaw');
    }
    else if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'memclaw');
    }
    else {
        return path.join(os.homedir(), '.local', 'share', 'memclaw');
    }
}
function getConfigPath() {
    return path.join(getDataDir(), 'config.toml');
}
function getDefaultContextEngineConfig() {
    return {
        serviceUrl: 'http://localhost:8085',
        tenantId: 'tenant_claw',
        defaultSessionId: 'default',
        autoStartServices: true,
        autoRecall: true,
        recallWindow: 5,
        recallLimit: 10,
        recallMinScore: 0.65,
        recallTokenBudget: 2000,
        autoCapture: true,
        commitTokenThreshold: 50000,
        commitTurnThreshold: 20,
        recentRawTurnCount: 8
    };
}
function parsePluginConfig(rawConfig) {
    const defaults = getDefaultContextEngineConfig();
    return {
        serviceUrl: rawConfig.serviceUrl ?? defaults.serviceUrl,
        tenantId: rawConfig.tenantId ?? defaults.tenantId,
        defaultSessionId: rawConfig.defaultSessionId ?? defaults.defaultSessionId,
        autoStartServices: rawConfig.autoStartServices ?? defaults.autoStartServices,
        autoRecall: rawConfig.autoRecall ?? defaults.autoRecall,
        recallWindow: rawConfig.recallWindow ?? defaults.recallWindow,
        recallLimit: rawConfig.recallLimit ?? defaults.recallLimit,
        recallMinScore: rawConfig.recallMinScore ?? defaults.recallMinScore,
        recallTokenBudget: rawConfig.recallTokenBudget ?? defaults.recallTokenBudget,
        autoCapture: rawConfig.autoCapture ?? defaults.autoCapture,
        commitTokenThreshold: rawConfig.commitTokenThreshold ?? defaults.commitTokenThreshold,
        commitTurnThreshold: rawConfig.commitTurnThreshold ?? defaults.commitTurnThreshold,
        recentRawTurnCount: rawConfig.recentRawTurnCount ?? defaults.recentRawTurnCount,
        llmApiBaseUrl: rawConfig.llmApiBaseUrl,
        llmApiKey: rawConfig.llmApiKey,
        llmModel: rawConfig.llmModel,
        embeddingApiBaseUrl: rawConfig.embeddingApiBaseUrl,
        embeddingApiKey: rawConfig.embeddingApiKey,
        embeddingModel: rawConfig.embeddingModel
    };
}
// ==================== Config File Management ====================
function generateConfigTemplate() {
    return `# MemClaw Context Engine Configuration
#
# This file was auto-generated. Please fill in the required values below.

# Qdrant Vector Database Configuration
[qdrant]
url = "http://localhost:6334"
collection_name = "memclaw"
timeout_secs = 30

# LLM Configuration [REQUIRED for memory processing]
[llm]
api_base_url = "https://api.openai.com/v1"
api_key = ""
model_efficient = "gpt-5-mini"
temperature = 0.1
max_tokens = 65536

# Embedding Configuration [REQUIRED for vector search]
[embedding]
api_base_url = "https://api.openai.com/v1"
api_key = ""
model_name = "text-embedding-3-small"
batch_size = 10
timeout_secs = 30

# Service Configuration
[server]
host = "localhost"
port = 8085
cors_origins = ["*"]

# Logging Configuration
[logging]
enabled = false
log_directory = "logs"
level = "info"

# Cortex Memory Settings
[cortex]
enable_intent_analysis = false
`;
}
function ensureConfigExists() {
    const dataDir = getDataDir();
    const configPath = getConfigPath();
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(configPath)) {
        const template = generateConfigTemplate();
        fs.writeFileSync(configPath, template, 'utf-8');
        return { created: true, path: configPath };
    }
    return { created: false, path: configPath };
}
function openConfigFile(configPath) {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let command;
        let args = [];
        if (platform === 'win32') {
            command = 'cmd';
            args = ['/c', 'start', '""', configPath];
        }
        else if (platform === 'darwin') {
            command = 'open';
            args = [configPath];
        }
        else {
            command = 'xdg-open';
            args = [configPath];
        }
        const proc = (0, child_process_1.spawn)(command, args, { detached: true, stdio: 'ignore' });
        proc.on('error', (err) => reject(err));
        proc.unref();
        resolve();
    });
}
function parseConfig(configPath) {
    const content = fs.readFileSync(configPath, 'utf-8');
    let parsed;
    try {
        parsed = smol_toml_1.default.parse(content);
    }
    catch (error) {
        console.error('Failed to parse config.toml:', error);
        parsed = {};
    }
    return {
        qdrant: {
            url: 'http://localhost:6334',
            collection_name: 'memclaw',
            timeout_secs: 30,
            ...(parsed.qdrant || {})
        },
        llm: {
            api_base_url: 'https://api.openai.com/v1',
            api_key: '',
            model_efficient: 'gpt-5-mini',
            temperature: 0.1,
            max_tokens: 4096,
            ...(parsed.llm || {})
        },
        embedding: {
            api_base_url: 'https://api.openai.com/v1',
            api_key: '',
            model_name: 'text-embedding-3-small',
            batch_size: 10,
            timeout_secs: 30,
            ...(parsed.embedding || {})
        },
        server: {
            host: 'localhost',
            port: 8085,
            ...(parsed.server || {})
        },
        logging: {
            enabled: false,
            log_directory: 'logs',
            level: 'info',
            ...(parsed.logging || {})
        },
        cortex: {
            enable_intent_analysis: false,
            ...(parsed.cortex || {})
        }
    };
}
function validateConfig(config) {
    const errors = [];
    if (!config.llm.api_key || config.llm.api_key === '') {
        errors.push('llm.api_key is required');
    }
    if (!config.embedding.api_key || config.embedding.api_key === '') {
        if (config.llm.api_key && config.llm.api_key !== '') {
            config.embedding.api_key = config.llm.api_key;
        }
        else {
            errors.push('embedding.api_key is required');
        }
    }
    return { valid: errors.length === 0, errors };
}
function updateConfigFromPlugin(pluginConfig) {
    const configPath = getConfigPath();
    ensureConfigExists();
    const existingConfig = parseConfig(configPath);
    const updatedConfig = {
        qdrant: existingConfig.qdrant,
        llm: {
            ...existingConfig.llm,
            api_base_url: pluginConfig.llmApiBaseUrl || existingConfig.llm.api_base_url,
            api_key: pluginConfig.llmApiKey || existingConfig.llm.api_key,
            model_efficient: pluginConfig.llmModel || existingConfig.llm.model_efficient
        },
        embedding: {
            ...existingConfig.embedding,
            api_base_url: pluginConfig.embeddingApiBaseUrl || existingConfig.embedding.api_base_url,
            api_key: pluginConfig.embeddingApiKey || existingConfig.embedding.api_key,
            model_name: pluginConfig.embeddingModel || existingConfig.embedding.model_name
        },
        server: existingConfig.server,
        logging: existingConfig.logging,
        cortex: existingConfig.cortex
    };
    const hasChanges = (pluginConfig.llmApiKey && pluginConfig.llmApiKey !== existingConfig.llm.api_key) ||
        (pluginConfig.llmApiBaseUrl && pluginConfig.llmApiBaseUrl !== existingConfig.llm.api_base_url) ||
        (pluginConfig.llmModel && pluginConfig.llmModel !== existingConfig.llm.model_efficient) ||
        (pluginConfig.embeddingApiKey && pluginConfig.embeddingApiKey !== existingConfig.embedding.api_key) ||
        (pluginConfig.embeddingApiBaseUrl && pluginConfig.embeddingApiBaseUrl !== existingConfig.embedding.api_base_url) ||
        (pluginConfig.embeddingModel && pluginConfig.embeddingModel !== existingConfig.embedding.model_name);
    if (!hasChanges) {
        return { updated: false, path: configPath };
    }
    const tomlContent = smol_toml_1.default.stringify(updatedConfig);
    fs.writeFileSync(configPath, tomlContent, 'utf-8');
    return { updated: true, path: configPath };
}
function mergeConfigWithPlugin(fileConfig, pluginConfig) {
    return {
        ...fileConfig,
        llm: {
            ...fileConfig.llm,
            api_base_url: pluginConfig.llmApiBaseUrl || fileConfig.llm.api_base_url,
            api_key: pluginConfig.llmApiKey || fileConfig.llm.api_key,
            model_efficient: pluginConfig.llmModel || fileConfig.llm.model_efficient
        },
        embedding: {
            ...fileConfig.embedding,
            api_base_url: pluginConfig.embeddingApiBaseUrl || fileConfig.embedding.api_base_url,
            api_key: pluginConfig.embeddingApiKey || fileConfig.embedding.api_key,
            model_name: pluginConfig.embeddingModel || fileConfig.embedding.model_name
        }
    };
}
//# sourceMappingURL=config.js.map
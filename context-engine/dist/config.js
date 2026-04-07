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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataDir = getDataDir;
exports.getConfigPath = getConfigPath;
exports.getDefaultContextEngineConfig = getDefaultContextEngineConfig;
exports.parsePluginConfig = parsePluginConfig;
exports.generateConfigTemplate = generateConfigTemplate;
exports.ensureConfigExists = ensureConfigExists;
exports.openConfigFile = openConfigFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
// ==================== Paths ====================
function getDataDir() {
    const platform = process.platform;
    if (platform === 'win32') {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'memclaw');
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
        autoCapture: true,
        commitTokenThreshold: 50000,
        commitTurnThreshold: 20,
        commitIntervalMs: 30 * 60 * 1000, // 30 minutes
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
        autoCapture: rawConfig.autoCapture ?? defaults.autoCapture,
        commitTokenThreshold: rawConfig.commitTokenThreshold ?? defaults.commitTokenThreshold,
        commitTurnThreshold: rawConfig.commitTurnThreshold ?? defaults.commitTurnThreshold,
        commitIntervalMs: rawConfig.commitIntervalMs ?? defaults.commitIntervalMs,
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
//# sourceMappingURL=config.js.map
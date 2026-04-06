"use strict";
/**
 * MemClaw Context Engine - OpenClaw Plugin Entry Point
 *
 * This plugin provides native context management for OpenClaw with:
 * - Automatic memory recall during context assembly
 * - Automatic message capture after each turn
 * - Intelligent compaction with memory extraction
 * - Archive expansion for retrieving compressed history
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTools = exports.openClawSessionToCortexId = exports.createContextEngine = exports.CortexMemClient = void 0;
exports.createPlugin = createPlugin;
const client_js_1 = require("./client.js");
const config_js_1 = require("./config.js");
const binaries_js_1 = require("./binaries.js");
const context_engine_js_1 = require("./context-engine.js");
const tools_js_1 = require("./tools.js");
// =================--- Plugin Implementation ====================
function createPlugin(api) {
    // Parse plugin config
    const rawConfig = (api.pluginConfig && typeof api.pluginConfig === 'object' && !Array.isArray(api.pluginConfig))
        ? api.pluginConfig
        : {};
    const config = (0, config_js_1.parsePluginConfig)(rawConfig);
    const log = (msg) => api.logger.info(`[memclaw-context-engine] ${msg}`);
    log('Initializing MemClaw Context Engine...');
    // Ensure config file exists
    const { created, path: configPath } = (0, config_js_1.ensureConfigExists)();
    if (created) {
        log(`Created configuration file: ${configPath}`);
        log('Opening configuration file for editing...');
        (0, config_js_1.openConfigFile)(configPath).catch((err) => {
            api.logger.warn(`[memclaw-context-engine] Could not open config file: ${err}`);
            api.logger.warn(`[memclaw-context-engine] Please manually edit: ${configPath}`);
        });
        api.logger.info(`
╔══════════════════════════════════════════════════════════╗
║  MemClaw Context Engine - First Run                      ║
║                                                          ║
║  A configuration file has been created:                  ║
║  ${configPath.padEnd(52)}║
║                                                          ║
║  Please fill in the required fields:                     ║
║  - llm.api_key (your LLM API key)                        ║
║  - embedding.api_key (your embedding API key)            ║
║                                                          ║
║  Save the file and restart OpenClaw to apply changes.    ║
╚══════════════════════════════════════════════════════════╝
    `);
    }
    // Create client
    const client = new client_js_1.CortexMemClient(config.serviceUrl);
    let servicesStarted = false;
    // Register service lifecycle
    api.registerService({
        id: 'memclaw-context-engine',
        start: async () => {
            // Skip service startup if config was just created (first run)
            if (created) {
                log('First run detected. Please complete configuration and restart OpenClaw.');
                return;
            }
            if (!config.autoStartServices) {
                log('Auto-start disabled, skipping service startup');
                return;
            }
            // Sync plugin config to config.toml if LLM/Embedding settings provided
            const pluginProvidedConfig = {
                llmApiBaseUrl: config.llmApiBaseUrl,
                llmApiKey: config.llmApiKey,
                llmModel: config.llmModel,
                embeddingApiBaseUrl: config.embeddingApiBaseUrl,
                embeddingApiKey: config.embeddingApiKey,
                embeddingModel: config.embeddingModel
            };
            const syncResult = (0, config_js_1.updateConfigFromPlugin)(pluginProvidedConfig);
            if (syncResult.updated) {
                log(`Synced LLM/Embedding config from OpenClaw to: ${syncResult.path}`);
            }
            // Check if binaries are available
            const hasQdrant = (0, binaries_js_1.isBinaryAvailable)('qdrant');
            const hasService = (0, binaries_js_1.isBinaryAvailable)('cortex-mem-service');
            if (!hasQdrant || !hasService) {
                log('Some binaries are missing. Services may need manual setup.');
            }
            // Parse and merge config (plugin config takes precedence)
            const fileConfig = (0, config_js_1.parseConfig)(configPath);
            const mergedConfig = (0, config_js_1.mergeConfigWithPlugin)(fileConfig, pluginProvidedConfig);
            const validation = (0, config_js_1.validateConfig)(mergedConfig);
            if (!validation.valid) {
                api.logger.warn(`[memclaw-context-engine] Configuration incomplete: ${validation.errors.join(', ')}`);
                api.logger.warn(`[memclaw-context-engine] Please configure LLM/Embedding API keys in OpenClaw plugin settings or edit: ${configPath}`);
                return;
            }
            // Start services
            try {
                log('Starting services...');
                await (0, binaries_js_1.ensureAllServices)(log);
                // Switch tenant
                await client.switchTenant(config.tenantId);
                log(`Switched to tenant: ${config.tenantId}`);
                servicesStarted = true;
                log('MemClaw Context Engine services started successfully');
            }
            catch (err) {
                api.logger.error(`[memclaw-context-engine] Failed to start services: ${err}`);
                api.logger.warn('[memclaw-context-engine] Context engine features may not work correctly');
            }
        },
        stop: async () => {
            log('Stopping MemClaw Context Engine...');
            (0, binaries_js_1.stopAllServices)();
            servicesStarted = false;
        }
    });
    // Helper to check if services are ready
    const ensureServicesReady = async () => {
        if (!servicesStarted) {
            const status = await (0, binaries_js_1.checkServiceStatus)();
            if (!status.cortexMemService) {
                throw new Error('cortex-mem-service is not running. Please start the service first.');
            }
        }
    };
    // ==================== Register Context Engine ====================
    if (api.registerContextEngine) {
        api.registerContextEngine('memclaw-context-engine', () => {
            const engine = (0, context_engine_js_1.createContextEngine)(config, client, api.logger);
            return {
                info: engine.getInfo(),
                ingest: (params) => engine.ingest(params),
                assemble: (params) => engine.assemble(params),
                afterTurn: (params) => engine.afterTurn(params),
                compact: (params) => engine.compact(params)
            };
        });
        log('Context Engine registered');
    }
    else {
        api.logger.warn('[memclaw-context-engine] registerContextEngine not available in this OpenClaw version');
    }
    // ==================== Register Tools ====================
    const toolConfig = {
        defaultSessionId: config.defaultSessionId,
        searchLimit: config.recallLimit,
        minScore: config.recallMinScore,
        tenantId: config.tenantId
    };
    const tools = (0, tools_js_1.createTools)(client, toolConfig, api.logger);
    for (const [name, tool] of tools) {
        api.registerTool(tool, { name });
    }
    log(`Registered ${tools.size} tools`);
    // Log ready message
    log('MemClaw Context Engine ready');
}
// ==================== Exports ====================
var client_js_2 = require("./client.js");
Object.defineProperty(exports, "CortexMemClient", { enumerable: true, get: function () { return client_js_2.CortexMemClient; } });
var context_engine_js_2 = require("./context-engine.js");
Object.defineProperty(exports, "createContextEngine", { enumerable: true, get: function () { return context_engine_js_2.createContextEngine; } });
Object.defineProperty(exports, "openClawSessionToCortexId", { enumerable: true, get: function () { return context_engine_js_2.openClawSessionToCortexId; } });
var tools_js_2 = require("./tools.js");
Object.defineProperty(exports, "createTools", { enumerable: true, get: function () { return tools_js_2.createTools; } });
__exportStar(require("./config.js"), exports);
__exportStar(require("./binaries.js"), exports);
// Default export for plugin entry point
exports.default = { createPlugin };
//# sourceMappingURL=index.js.map
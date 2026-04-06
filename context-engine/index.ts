/**
 * MemClaw Context Engine - OpenClaw Plugin Entry Point
 *
 * This plugin provides native context management for OpenClaw with:
 * - Automatic memory recall during context assembly
 * - Automatic message capture after each turn
 * - Intelligent compaction with memory extraction
 * - Archive expansion for retrieving compressed history
 */

import { CortexMemClient } from './client.js';
import {
	ensureConfigExists,
	openConfigFile,
	getConfigPath,
	parsePluginConfig,
} from './config.js';
import { ensureAllServices, checkServiceStatus, isBinaryAvailable, stopAllServices } from './binaries.js';
import { createContextEngine, openClawSessionToCortexId } from './context-engine.js';
import { createTools } from './tools.js';

// ==================== Plugin API Types ====================

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
		(tool: ToolDefinition, opts?: { name?: string; names?: string[] }): void;
		(factory: (ctx: unknown) => ToolDefinition, opts?: { name?: string; names?: string[] }): void;
	};
	registerService: (service: {
		id: string;
		start: (ctx?: unknown) => void | Promise<void>;
		stop?: (ctx?: unknown) => void | Promise<void>;
	}) => void;
	registerContextEngine?: (id: string, factory: () => unknown) => void;
};

// =================--- Plugin Implementation ====================

export function createPlugin(api: OpenClawPluginApi) {
	// Parse plugin config
	const rawConfig = (api.pluginConfig && typeof api.pluginConfig === 'object' && !Array.isArray(api.pluginConfig))
		? (api.pluginConfig as Record<string, unknown>)
		: {};

	const config = parsePluginConfig(rawConfig);
	const log = (msg: string) => api.logger.info(`[memclaw-context-engine] ${msg}`);

	log('Initializing MemClaw Context Engine...');

	// Ensure config file exists
	const { created, path: configPath } = ensureConfigExists();

	if (created) {
		log(`Created configuration file: ${configPath}`);
		log('Opening configuration file for editing...');

		openConfigFile(configPath).catch((err) => {
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
	const client = new CortexMemClient(config.serviceUrl);
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

			// Check if binaries are available
			const hasQdrant = isBinaryAvailable('qdrant');
			const hasService = isBinaryAvailable('cortex-mem-service');

			if (!hasQdrant || !hasService) {
				log('Some binaries are missing. Services may need manual setup.');
			}

			// Start services
			try {
				log('Starting services...');
				await ensureAllServices(log);

				// Switch tenant
				await client.switchTenant(config.tenantId);
				log(`Switched to tenant: ${config.tenantId}`);

				servicesStarted = true;
				log('MemClaw Context Engine services started successfully');
			} catch (err) {
				api.logger.error(`[memclaw-context-engine] Failed to start services: ${err}`);
				api.logger.warn('[memclaw-context-engine] Context engine features may not work correctly');
			}
		},
		stop: async () => {
			log('Stopping MemClaw Context Engine...');
			stopAllServices();
			servicesStarted = false;
		}
	});

	// Helper to check if services are ready
	const ensureServicesReady = async (): Promise<void> => {
		if (!servicesStarted) {
			const status = await checkServiceStatus();
			if (!status.cortexMemService) {
				throw new Error('cortex-mem-service is not running. Please start the service first.');
			}
		}
	};

	// ==================== Register Context Engine ====================

	if (api.registerContextEngine) {
		api.registerContextEngine('memclaw-context-engine', () => {
			const engine = createContextEngine(config, client, api.logger);
			
			return {
				info: engine.getInfo(),
				ingest: (params: Parameters<typeof engine.ingest>[0]) => engine.ingest(params),
				assemble: (params: Parameters<typeof engine.assemble>[0]) => engine.assemble(params),
				afterTurn: (params: Parameters<typeof engine.afterTurn>[0]) => engine.afterTurn(params),
				compact: (params: Parameters<typeof engine.compact>[0]) => engine.compact(params)
			};
		});
		log('Context Engine registered');
	} else {
		api.logger.warn('[memclaw-context-engine] registerContextEngine not available in this OpenClaw version');
	}

	// ==================== Register Tools ====================

	const toolConfig = {
		defaultSessionId: config.defaultSessionId,
		searchLimit: config.recallLimit,
		minScore: config.recallMinScore,
		tenantId: config.tenantId
	};

	const tools = createTools(client, toolConfig, api.logger);

	for (const [name, tool] of tools) {
		api.registerTool(tool, { name });
	}

	log(`Registered ${tools.size} tools`);

	// Log ready message
	log('MemClaw Context Engine ready');
}

// ==================== Exports ====================

export { CortexMemClient } from './client.js';
export { createContextEngine, openClawSessionToCortexId } from './context-engine.js';
export { createTools } from './tools.js';
export { parsePluginConfig, getDefaultContextEngineConfig, type ContextEngineConfig } from './config.js';
export * from './binaries.js';

// Default export for plugin entry point
export default { createPlugin };

/**
 * Configuration management for MemClaw Context Engine
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

// ==================== Paths ====================

export function getDataDir(): string {
	const platform = process.platform;

	if (platform === 'win32') {
		return path.join(
			process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
			'memclaw'
		);
	} else if (platform === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Application Support', 'memclaw');
	} else {
		return path.join(os.homedir(), '.local', 'share', 'memclaw');
	}
}

export function getConfigPath(): string {
	return path.join(getDataDir(), 'config.toml');
}

// ==================== Config Types ====================

export interface ContextEngineConfig {
	// Basic
	serviceUrl: string;
	tenantId: string;
	defaultSessionId: string;
	autoStartServices: boolean;

	// Auto Recall
	autoRecall: boolean;
	recallWindow: number;
	recallLimit: number;
	recallMinScore: number;

	// Auto Capture
	autoCapture: boolean;
	commitTokenThreshold: number;
	commitTurnThreshold: number;
	commitIntervalMs: number;
}

export function getDefaultContextEngineConfig(): ContextEngineConfig {
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

export function parsePluginConfig(rawConfig: Record<string, unknown>): ContextEngineConfig {
	const defaults = getDefaultContextEngineConfig();

	return {
		serviceUrl: (rawConfig.serviceUrl as string) ?? defaults.serviceUrl,
		tenantId: (rawConfig.tenantId as string) ?? defaults.tenantId,
		defaultSessionId: (rawConfig.defaultSessionId as string) ?? defaults.defaultSessionId,
		autoStartServices: (rawConfig.autoStartServices as boolean) ?? defaults.autoStartServices,
		autoRecall: (rawConfig.autoRecall as boolean) ?? defaults.autoRecall,
		recallWindow: (rawConfig.recallWindow as number) ?? defaults.recallWindow,
		recallLimit: (rawConfig.recallLimit as number) ?? defaults.recallLimit,
		recallMinScore: (rawConfig.recallMinScore as number) ?? defaults.recallMinScore,
		autoCapture: (rawConfig.autoCapture as boolean) ?? defaults.autoCapture,
		commitTokenThreshold: (rawConfig.commitTokenThreshold as number) ?? defaults.commitTokenThreshold,
		commitTurnThreshold: (rawConfig.commitTurnThreshold as number) ?? defaults.commitTurnThreshold,
		commitIntervalMs: (rawConfig.commitIntervalMs as number) ?? defaults.commitIntervalMs,
	};
}

// ==================== Config File Management ====================

export function generateConfigTemplate(): string {
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

export function ensureConfigExists(): { created: boolean; path: string } {
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

export function openConfigFile(configPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const platform = process.platform;
		let command: string;
		let args: string[] = [];

		if (platform === 'win32') {
			command = 'cmd';
			args = ['/c', 'start', '""', configPath];
		} else if (platform === 'darwin') {
			command = 'open';
			args = [configPath];
		} else {
			command = 'xdg-open';
			args = [configPath];
		}

		const proc = spawn(command, args, { detached: true, stdio: 'ignore' });
		proc.on('error', (err) => reject(err));
		proc.unref();
		resolve();
	});
}

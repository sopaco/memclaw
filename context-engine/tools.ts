/**
 * Tool Definitions for MemClaw Context Engine
 *
 * Tools available for explicit model invocation.
 * The Context Engine handles automatic recall; these tools are for manual operations.
 */

import type { CortexMemClient, SearchResult, Layer } from './client.js';
import { executeCliCommand } from './binaries.js';
import { getConfigPath } from './config.js';

// ==================== Types ====================

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

// ==================== Tool Schemas ====================

const toolSchemas = {
	cortex_search: {
		name: 'cortex_search',
		description: `Layered semantic search across ALL memories using L0/L1/L2 tiered retrieval.

**Key Features:**
- Tiered retrieval: L0 (abstract) -> L1 (overview) -> L2 (full content)
- Token-efficient: Control exactly which layers to return

**When to use:**
- Finding past conversations, decisions, or any historical info
- Omit scope to search across ALL dimensions (recommended for most cases)

**Parameters:**
- return_layers: ["L0"] (default, ~100 tokens), ["L0","L1"] (~2100 tokens), ["L0","L1","L2"] (full)`,
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'The search query - can be natural language or keywords'
				},
				scope: {
					type: 'string',
					description: `Optional. Omit to search ALL memories (recommended).`
				},
				limit: {
					type: 'integer',
					description: 'Maximum number of results to return (default: 10)',
					default: 10
				},
				min_score: {
					type: 'number',
					description: 'Minimum relevance score threshold (0-1, default: 0.6)',
					default: 0.6
				},
				return_layers: {
					type: 'array',
					items: {
						type: 'string',
						enum: ['L0', 'L1', 'L2']
					},
					description: 'Which layers to return. Default: ["L0"]',
					default: ['L0']
				}
			},
			required: ['query']
		}
	},

	cortex_recall: {
		name: 'cortex_recall',
		description: `Recall memories with full context (L0 snippet + L2 content).

Equivalent to cortex_search with return_layers=["L0","L2"].`,
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'The search query'
				},
				scope: {
					type: 'string',
					description: 'Optional. Omit to search all memories.'
				},
				limit: {
					type: 'integer',
					description: 'Maximum number of results (default: 10)',
					default: 10
				}
			},
			required: ['query']
		}
	},

	cortex_add_memory: {
		name: 'cortex_add_memory',
		description: `Add a message to memory for a specific session.

This stores the message and automatically triggers:
- Vector embedding for semantic search
- L0/L1 layer generation (async)

Use this to persist important information that should be searchable later.`,
		inputSchema: {
			type: 'object',
			properties: {
				content: {
					type: 'string',
					description: 'The content to store in memory'
				},
				role: {
					type: 'string',
					enum: ['user', 'assistant', 'system'],
					description: 'Role of the message sender (default: user)',
					default: 'user'
				},
				session_id: {
					type: 'string',
					description: 'Session/thread ID (uses default if not specified)'
				},
				metadata: {
					type: 'object',
					description: 'Optional metadata (tags, importance, custom fields)',
					additionalProperties: true
				}
			},
			required: ['content']
		}
	},

	cortex_commit_session: {
		name: 'cortex_commit_session',
		description: `Close the current session to trigger memory extraction.

This closes the session and triggers the complete memory processing pipeline:
1. Extracts structured memories (user preferences, entities, decisions)
2. Generates complete L0/L1 layer summaries
3. Indexes all extracted memories into the vector database

**When to call this tool:**
- After completing a significant task or topic discussion
- After the user has shared important preferences or decisions
- Before ending a conversation session`,
		inputSchema: {
			type: 'object',
			properties: {
				session_id: {
					type: 'string',
					description: 'Session/thread ID to close (uses default if not specified)'
				}
			}
		}
	},

	cortex_ls: {
		name: 'cortex_ls',
		description: `List directory contents to browse the memory space like a virtual filesystem.

This allows you to explore the hierarchical structure of memories:
- cortex://session - List all sessions
- cortex://session/{session_id} - Browse a specific session
- cortex://user/{user_id}/preferences - View user preferences
- cortex://agent/{agent_id}/cases - View agent cases`,
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'Directory URI to list (default: cortex://session)',
					default: 'cortex://session'
				},
				recursive: {
					type: 'boolean',
					description: 'Whether to recursively list subdirectories',
					default: false
				},
				include_abstracts: {
					type: 'boolean',
					description: 'Whether to include L0 abstracts for each file',
					default: false
				}
			}
		}
	},

	cortex_get_abstract: {
		name: 'cortex_get_abstract',
		description: `Get L0 abstract layer (~100 tokens) for quick relevance checking.`,
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'Content URI (file or directory)'
				}
			},
			required: ['uri']
		}
	},

	cortex_get_overview: {
		name: 'cortex_get_overview',
		description: `Get L1 overview layer (~2000 tokens) with core information and context.`,
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'Content URI (file or directory)'
				}
			},
			required: ['uri']
		}
	},

	cortex_get_content: {
		name: 'cortex_get_content',
		description: `Get L2 full content layer - the complete original content.`,
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'Content URI (file only)'
				}
			},
			required: ['uri']
		}
	},

	cortex_forget: {
		name: 'cortex_forget',
		description: `Delete a memory by URI.`,
		inputSchema: {
			type: 'object',
			properties: {
				uri: {
					type: 'string',
					description: 'Exact memory URI to delete'
				}
			},
			required: ['uri']
		}
	},

	cortex_maintenance: {
		name: 'cortex_maintenance',
		description: `Perform periodic maintenance on MemClaw data.

This executes:
1. vector prune - Remove vectors whose source files no longer exist
2. vector reindex - Rebuild vector index and remove stale entries
3. layers ensure-all - Generate missing L0/L1 layer files

**This tool is typically called automatically by a scheduled timer.**
You can also call it manually when:
- Search results seem incomplete or stale
- After recovering from a crash or data corruption
- When disk space cleanup is needed

**Parameters:**
- dryRun: Preview changes without executing (default: false)
- commands: Which commands to run (default: all)`,
		inputSchema: {
			type: 'object',
			properties: {
				dryRun: {
					type: 'boolean',
					description: 'Preview changes without executing',
					default: false
				},
				commands: {
					type: 'array',
					items: {
						type: 'string',
						enum: ['prune', 'reindex', 'ensure-all']
					},
					description: 'Which maintenance commands to run',
					default: ['prune', 'reindex', 'ensure-all']
				}
			}
		}
	}
};

// =================--- Tool Factory ====================

export function createTools(
	client: CortexMemClient,
	config: { defaultSessionId: string; searchLimit: number; minScore: number; tenantId: string },
	logger: PluginLogger
): Map<string, ToolDefinition> {
	const tools = new Map<string, ToolDefinition>();

	// cortex_search
	tools.set('cortex_search', {
		name: 'cortex_search',
		description: toolSchemas.cortex_search.description,
		parameters: toolSchemas.cortex_search.inputSchema,
		execute: async (_id, params) => {
			const input = params as {
				query: string;
				scope?: string;
				limit?: number;
				min_score?: number;
				return_layers?: Layer[];
			};

			try {
				const results = await client.search({
					query: input.query,
					scope: input.scope,
					limit: input.limit ?? config.searchLimit,
					min_score: input.min_score ?? config.minScore,
					return_layers: input.return_layers ?? ['L0']
				});

				const formatted = results
					.map((r, i) => {
						let content = `${i + 1}. [Score: ${r.score.toFixed(2)}] URI: ${r.uri}\n`;
						content += `   Layers: ${r.layers.join(', ')}\n`;
						content += `   Snippet: ${r.snippet}\n`;
						if (r.overview) {
							content += `   Overview: ${r.overview.substring(0, 200)}...\n`;
						}
						if (r.content) {
							const preview = r.content.length > 200 ? r.content.substring(0, 200) + '...' : r.content;
							content += `   Content: ${preview}\n`;
						}
						return content;
					})
					.join('\n');

				return {
					content: `Found ${results.length} results for "${input.query}":\n\n${formatted}`,
					results: results.map((r) => ({
						uri: r.uri,
						score: r.score,
						snippet: r.snippet,
						overview: r.overview,
						content: r.content,
						layers: r.layers
					})),
					total: results.length
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_search failed: ${message}`);
				return { error: `Search failed: ${message}` };
			}
		}
	});

	// cortex_recall
	tools.set('cortex_recall', {
		name: 'cortex_recall',
		description: toolSchemas.cortex_recall.description,
		parameters: toolSchemas.cortex_recall.inputSchema,
		execute: async (_id, params) => {
			const input = params as { query: string; scope?: string; limit?: number };

			try {
				const results = await client.recall(input.query, input.scope, input.limit ?? 10);

				const formatted = results
					.map((r, i) => {
						let content = `${i + 1}. [Score: ${r.score.toFixed(2)}] URI: ${r.uri}\n`;
						content += `   Snippet: ${r.snippet}\n`;
						if (r.content) {
							const preview = r.content.length > 300 ? r.content.substring(0, 300) + '...' : r.content;
							content += `   Content: ${preview}\n`;
						}
						return content;
					})
					.join('\n');

				return {
					content: `Recalled ${results.length} memories:\n\n${formatted}`,
					results,
					total: results.length
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_recall failed: ${message}`);
				return { error: `Recall failed: ${message}` };
			}
		}
	});

	// cortex_add_memory
	tools.set('cortex_add_memory', {
		name: 'cortex_add_memory',
		description: toolSchemas.cortex_add_memory.description,
		parameters: toolSchemas.cortex_add_memory.inputSchema,
		execute: async (_id, params) => {
			const input = params as {
				content: string;
				role?: string;
				session_id?: string;
				metadata?: Record<string, unknown>;
			};

			try {
				const sessionId = input.session_id ?? config.defaultSessionId;
				const result = await client.addMessage(sessionId, {
					role: (input.role ?? 'user') as 'user' | 'assistant' | 'system',
					content: input.content,
					metadata: input.metadata
				});

				return {
					content: `Memory stored successfully in session "${sessionId}".\nResult: ${result}`,
					success: true,
					message_uri: result
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_add_memory failed: ${message}`);
				return { error: `Failed to add memory: ${message}` };
			}
		}
	});

	// cortex_commit_session
	tools.set('cortex_commit_session', {
		name: 'cortex_commit_session',
		description: toolSchemas.cortex_commit_session.description,
		parameters: toolSchemas.cortex_commit_session.inputSchema,
		execute: async (_id, params) => {
			const input = params as { session_id?: string };

			try {
				const sessionId = input.session_id ?? config.defaultSessionId;
				const result = await client.closeSession(sessionId, true);

				const memCount = Object.values(result.memories_extracted ?? {}).reduce((a, b) => a + b, 0);

				return {
					content: `Session "${sessionId}" closed successfully.\nStatus: ${result.status}, Memories extracted: ${memCount}`,
					success: true,
					session: {
						thread_id: result.thread_id,
						status: result.status,
						memories_extracted: result.memories_extracted
					}
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_commit_session failed: ${message}`);
				return { error: `Failed to close session: ${message}` };
			}
		}
	});

	// cortex_ls
	tools.set('cortex_ls', {
		name: 'cortex_ls',
		description: toolSchemas.cortex_ls.description,
		parameters: toolSchemas.cortex_ls.inputSchema,
		execute: async (_id, params) => {
			const input = params as {
				uri?: string;
				recursive?: boolean;
				include_abstracts?: boolean;
			};

			try {
				const result = await client.ls({
					uri: input.uri ?? 'cortex://session',
					recursive: input.recursive ?? false,
					include_abstracts: input.include_abstracts ?? false
				});

				if (result.entries.length === 0) {
					return { content: `Directory "${result.uri}" is empty or does not exist.` };
				}

				const formatted = result.entries
					.map((e, i) => {
						let content = `${i + 1}. ${e.is_directory ? '📁' : '📄'} ${e.name}\n`;
						content += `   URI: ${e.uri}\n`;
						if (!e.is_directory) {
							content += `   Size: ${e.size} bytes\n`;
						}
						if (e.abstract_text) {
							const preview = e.abstract_text.length > 100
								? e.abstract_text.substring(0, 100) + '...'
								: e.abstract_text;
							content += `   Abstract: ${preview}\n`;
						}
						return content;
					})
					.join('\n');

				return {
					content: `Directory "${result.uri}" (${result.total} entries):\n\n${formatted}`,
					entries: result.entries,
					total: result.total
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_ls failed: ${message}`);
				return { error: `List directory failed: ${message}` };
			}
		}
	});

	// cortex_get_abstract
	tools.set('cortex_get_abstract', {
		name: 'cortex_get_abstract',
		description: toolSchemas.cortex_get_abstract.description,
		parameters: toolSchemas.cortex_get_abstract.inputSchema,
		execute: async (_id, params) => {
			const input = params as { uri: string };

			try {
				const result = await client.getAbstract(input.uri);

				return {
					content: `L0 Abstract for "${result.uri}" (~${result.token_count} tokens):\n\n${result.content}`,
					uri: result.uri,
					abstract: result.content,
					token_count: result.token_count,
					layer: result.layer
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_get_abstract failed: ${message}`);
				return { error: `Get abstract failed: ${message}` };
			}
		}
	});

	// cortex_get_overview
	tools.set('cortex_get_overview', {
		name: 'cortex_get_overview',
		description: toolSchemas.cortex_get_overview.description,
		parameters: toolSchemas.cortex_get_overview.inputSchema,
		execute: async (_id, params) => {
			const input = params as { uri: string };

			try {
				const result = await client.getOverview(input.uri);

				return {
					content: `L1 Overview for "${result.uri}" (~${result.token_count} tokens):\n\n${result.content}`,
					uri: result.uri,
					overview: result.content,
					token_count: result.token_count,
					layer: result.layer
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_get_overview failed: ${message}`);
				return { error: `Get overview failed: ${message}` };
			}
		}
	});

	// cortex_get_content
	tools.set('cortex_get_content', {
		name: 'cortex_get_content',
		description: toolSchemas.cortex_get_content.description,
		parameters: toolSchemas.cortex_get_content.inputSchema,
		execute: async (_id, params) => {
			const input = params as { uri: string };

			try {
				const result = await client.getContent(input.uri);

				return {
					content: `L2 Full Content for "${result.uri}" (~${result.token_count} tokens):\n\n${result.content}`,
					uri: result.uri,
					full_content: result.content,
					token_count: result.token_count,
					layer: result.layer
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_get_content failed: ${message}`);
				return { error: `Get content failed: ${message}` };
			}
		}
	});

	// cortex_forget
	tools.set('cortex_forget', {
		name: 'cortex_forget',
		description: toolSchemas.cortex_forget.description,
		parameters: toolSchemas.cortex_forget.inputSchema,
		execute: async (_id, params) => {
			const input = params as { uri: string };

			try {
				await client.deleteUri(input.uri);

				return {
					content: `Forgotten: ${input.uri}`,
					success: true
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[context-engine] cortex_forget failed: ${message}`);
				return { error: `Forget failed: ${message}` };
			}
		}
	});

	// cortex_maintenance
	tools.set('cortex_maintenance', {
		name: 'cortex_maintenance',
		description: toolSchemas.cortex_maintenance.description,
		parameters: toolSchemas.cortex_maintenance.inputSchema,
		execute: async (_id, params) => {
			const input = params as {
				dryRun?: boolean;
				commands?: string[];
			};

			const dryRun = input.dryRun ?? false;
			const commands = input.commands ?? ['prune', 'reindex', 'ensure-all'];
			const currentConfigPath = getConfigPath();

			const results: { command: string; success: boolean; output: string }[] = [];

			for (const cmd of commands) {
				let cliArgs: string[];
				let description: string;

				switch (cmd) {
					case 'prune':
						cliArgs = ['vector', 'prune'];
						if (dryRun) cliArgs.push('--dry-run');
						description = 'Vector Prune';
						break;
					case 'reindex':
						cliArgs = ['vector', 'reindex'];
						description = 'Vector Reindex';
						break;
					case 'ensure-all':
						cliArgs = ['layers', 'ensure-all'];
						description = 'Layers Ensure-All';
						break;
					default:
						continue;
				}

				logger.info(`[maintenance] Running: ${description}`);

				try {
					const result = await executeCliCommand(
						cliArgs,
						currentConfigPath,
						config.tenantId,
						300000 // 5 minute timeout for maintenance
					);

					results.push({
						command: description,
						success: result.success,
						output: result.stdout || result.stderr
					});

					if (!result.success) {
						logger.warn(`[context-engine] [maintenance] ${description} failed: ${result.stderr}`);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					results.push({
						command: description,
						success: false,
						output: message
					});
					logger.error(`[maintenance] ${description} error: ${message}`);
				}
			}

			const summary = results.map((r) => `${r.command}: ${r.success ? 'OK' : 'FAILED'}`).join('\n');

			const successCount = results.filter((r) => r.success).length;

			return {
				content: `Maintenance ${dryRun ? '(dry run) ' : ''}completed:\n${summary}\n\n${successCount}/${results.length} commands succeeded.`,
				dryRun,
				results,
				success: successCount === results.length
			};
		}
	});

	return tools;
}

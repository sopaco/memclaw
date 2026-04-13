"use strict";
/**
 * Memory Adapter for OpenClaw
 *
 * Adapts CortexMemClient to OpenClaw's MemoryPluginCapability interface.
 * This allows MemClaw to function as a native OpenClaw memory plugin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CortexMemorySearchManager = void 0;
exports.getMemorySearchManager = getMemorySearchManager;
exports.closeAllMemorySearchManagers = closeAllMemorySearchManagers;
exports.createMemoryPromptSectionBuilder = createMemoryPromptSectionBuilder;
exports.createMemoryFlushPlanResolver = createMemoryFlushPlanResolver;
exports.createMemoryRuntime = createMemoryRuntime;
exports.createMemoryPluginCapability = createMemoryPluginCapability;
const client_js_1 = require("./client.js");
// =============================================================================
// CortexMemorySearchManager - Adapter Implementation
// =============================================================================
/**
 * Adapts CortexMemClient to OpenClaw's MemorySearchManager interface.
 *
 * This allows MemClaw to be used as a drop-in replacement for OpenClaw's
 * built-in memory search, enabling seamless integration with the memory slot.
 */
class CortexMemorySearchManager {
    client;
    tenantId;
    defaultSessionKey;
    _status;
    _closed = false;
    /** Check if the manager has been closed */
    get closed() {
        return this._closed;
    }
    constructor(options) {
        this.client = options.client;
        this.tenantId = options.tenantId;
        this.defaultSessionKey = options.defaultSessionKey ?? 'default';
        this._status = {
            backend: 'cortex',
            provider: 'memclaw',
            model: 'cortex-memory',
            sources: ['memory', 'sessions'],
            vector: {
                enabled: true,
                available: true,
            },
            cache: {
                enabled: true,
            },
            fts: {
                enabled: true,
                available: true,
            },
            custom: {
                tiered: true,
                layers: ['L0', 'L1', 'L2'],
            },
        };
    }
    /**
     * Search memories using Cortex Memory's tiered retrieval.
     *
     * Converts Cortex search results to OpenClaw's MemorySearchResult format.
     */
    async search(query, opts) {
        if (this._closed) {
            throw new Error('MemorySearchManager is closed');
        }
        try {
            // Map sessionKey to Cortex scope
            const scope = this.resolveScope(opts?.sessionKey);
            const results = await this.client.search({
                query,
                scope,
                limit: opts?.maxResults ?? 10,
                min_score: opts?.minScore ?? 0.6,
                return_layers: ['L0'], // Use L0 for snippets (token-efficient)
            });
            return results.map((r) => this.toMemorySearchResult(r));
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Cortex search failed: ${message}`);
        }
    }
    /**
     * Read a memory file by path.
     *
     * Uses Cortex's filesystem API to read content.
     */
    async readFile(params) {
        if (this._closed) {
            throw new Error('MemorySearchManager is closed');
        }
        try {
            // Convert relative path to Cortex URI
            const uri = this.toCortexUri(params.relPath);
            // Get L2 full content
            const response = await this.client.getContent(uri);
            let text = response.content;
            // Apply line range if specified
            if (params.from !== undefined || params.lines !== undefined) {
                const textLines = text.split('\n');
                const start = (params.from ?? 1) - 1; // Convert 1-indexed to 0-indexed
                const count = params.lines ?? textLines.length - start;
                text = textLines.slice(start, start + count).join('\n');
            }
            return {
                text,
                path: params.relPath,
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to read memory file: ${message}`);
        }
    }
    /**
     * Return the current memory provider status.
     */
    status() {
        return { ...this._status };
    }
    /**
     * Sync is handled automatically by Cortex Memory service.
     * This is a no-op for compatibility.
     */
    async sync(params) {
        // Cortex Memory handles sync internally via commit operations
        // No explicit sync needed
        return;
    }
    /**
     * Check if embedding service is available.
     */
    async probeEmbeddingAvailability() {
        try {
            // Try a simple search to probe availability
            await this.client.search({
                query: 'probe',
                limit: 1,
                min_score: 0,
                return_layers: ['L0'],
            });
            return { ok: true };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: message };
        }
    }
    /**
     * Check if vector search is available.
     */
    async probeVectorAvailability() {
        try {
            const result = await this.probeEmbeddingAvailability();
            return result.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Close the manager and release resources.
     */
    async close() {
        this._closed = true;
    }
    // ===========================================================================
    // Private Helpers
    // ===========================================================================
    /**
     * Map OpenClaw sessionKey to Cortex scope URI.
     */
    resolveScope(sessionKey) {
        if (!sessionKey) {
            return undefined; // Search all memories
        }
        // sessionKey format: agentId or agentId/threadId
        const parts = sessionKey.split('/');
        if (parts.length === 1) {
            // Single agent ID - search within agent scope
            return `cortex://session/${sessionKey}`;
        }
        // Agent and thread - search specific session
        return `cortex://session/${sessionKey}`;
    }
    /**
     * Convert Cortex SearchResult to OpenClaw MemorySearchResult.
     */
    toMemorySearchResult(result) {
        // Parse URI to get path
        // URI format: cortex://session/{id}/timeline/{idx}.md or similar
        const path = this.uriToPath(result.uri);
        return {
            path,
            startLine: 1,
            endLine: 1,
            score: result.score,
            snippet: result.snippet,
            source: this.inferSource(result.uri),
            citation: result.uri,
        };
    }
    /**
     * Convert Cortex URI to relative file path.
     */
    uriToPath(uri) {
        // cortex://session/{id}/timeline/{idx}.md -> session/{id}/timeline/{idx}.md
        const match = uri.match(/^cortex:\/\/(.+)$/);
        return match ? match[1] : uri;
    }
    /**
     * Convert relative path to Cortex URI.
     */
    toCortexUri(relPath) {
        if (relPath.startsWith('cortex://')) {
            return relPath;
        }
        return `cortex://${relPath}`;
    }
    /**
     * Infer memory source from URI.
     */
    inferSource(uri) {
        if (uri.includes('/session/')) {
            return 'sessions';
        }
        return 'memory';
    }
}
exports.CortexMemorySearchManager = CortexMemorySearchManager;
// =============================================================================
// Manager Registry for Multi-Agent Support
// =============================================================================
/**
 * Global registry of active memory managers.
 * OpenClaw may request managers for different agents.
 */
const managerRegistry = new Map();
/**
 * Get or create a memory search manager for an agent.
 */
async function getMemorySearchManager(params) {
    const cacheKey = `${params.tenantId}:${params.agentId}`;
    // Return cached manager if available
    const cached = managerRegistry.get(cacheKey);
    if (cached && !cached.closed) {
        return { manager: cached };
    }
    try {
        const client = new client_js_1.CortexMemClient(params.serviceUrl);
        // Switch to the tenant
        await client.switchTenant(params.tenantId);
        const manager = new CortexMemorySearchManager({
            client,
            tenantId: params.tenantId,
            defaultSessionKey: params.sessionKey,
        });
        managerRegistry.set(cacheKey, manager);
        return { manager };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { manager: null, error: message };
    }
}
/**
 * Close all active memory managers.
 */
async function closeAllMemorySearchManagers() {
    const closePromises = Array.from(managerRegistry.values()).map(async (manager) => {
        try {
            await manager.close?.();
        }
        catch {
            // Ignore close errors
        }
    });
    await Promise.all(closePromises);
    managerRegistry.clear();
}
// =============================================================================
// Memory Plugin Capability Factory Functions (OpenClaw Official APIs)
// =============================================================================
/**
 * Create memory prompt section builder for api.registerMemoryPromptSection.
 *
 * This builds the system prompt section that guides agents on using Cortex Memory.
 */
function createMemoryPromptSectionBuilder() {
    return ({ availableTools, citationsMode }) => {
        if (!availableTools.has('cortex_search')) {
            return [];
        }
        const lines = [
            '## Cortex Memory',
            '',
            'Use the Cortex Memory tools for semantic memory operations:',
            '- `cortex_search` - Layered semantic search (L0/L1/L2)',
            '- `cortex_recall` - Recall with full context',
            '- `cortex_add_memory` - Store new memories',
            '- `cortex_commit_session` - Commit and extract memories',
            '',
        ];
        if (citationsMode !== 'off') {
            lines.push('Citations are enabled. Search results include `citation` fields.');
            lines.push('');
        }
        return lines;
    };
}
/**
 * Create memory flush plan resolver for api.registerMemoryFlushPlan.
 *
 * This determines when and how to flush memory during compaction.
 */
function createMemoryFlushPlanResolver() {
    return ({ cfg, nowMs }) => {
        return {
            softThresholdTokens: 8000,
            forceFlushTranscriptBytes: 100000,
            reserveTokensFloor: 2000,
            prompt: 'Cortex memory flush',
            systemPrompt: 'Summarize and extract memories from the conversation.',
            relativePath: 'cortex/memory.md',
        };
    };
}
/**
 * Create memory runtime for api.registerMemoryRuntime.
 *
 * This provides the MemorySearchManager implementation that OpenClaw uses
 * for memory operations.
 */
function createMemoryRuntime(options) {
    return {
        getMemorySearchManager: async ({ cfg, agentId, purpose }) => {
            // Extract config from cfg (OpenClawConfig)
            const config = cfg;
            const pluginConfig = config?.plugins?.entries?.['memclaw']?.config ?? {};
            const serviceUrl = pluginConfig.serviceUrl ?? options.serviceUrl;
            const tenantId = pluginConfig.tenantId ?? options.tenantId;
            return getMemorySearchManager({
                serviceUrl,
                tenantId,
                agentId,
            });
        },
        resolveMemoryBackendConfig: ({ cfg, agentId }) => {
            return {
                backend: 'cortex',
            };
        },
        closeAllMemorySearchManagers,
    };
}
/**
 * @deprecated Use createMemoryPromptSectionBuilder, createMemoryFlushPlanResolver,
 * and createMemoryRuntime instead. This function is kept for backward compatibility.
 *
 * Create the MemoryPluginCapability object for legacy registerMemoryCapability.
 */
function createMemoryPluginCapability(options) {
    return {
        promptBuilder: createMemoryPromptSectionBuilder(),
        flushPlanResolver: createMemoryFlushPlanResolver(),
        runtime: createMemoryRuntime(options),
        publicArtifacts: {
            listArtifacts: async ({ cfg }) => {
                const config = cfg;
                const pluginConfig = config?.plugins?.entries?.['memclaw']?.config ?? {};
                const serviceUrl = pluginConfig.serviceUrl ?? options.serviceUrl;
                const tenantId = pluginConfig.tenantId ?? options.tenantId;
                try {
                    const client = new client_js_1.CortexMemClient(serviceUrl);
                    await client.switchTenant(tenantId);
                    const lsResult = await client.ls({
                        uri: 'cortex://session',
                        recursive: true,
                    });
                    return lsResult.entries.map((entry) => ({
                        uri: entry.uri,
                        name: entry.name,
                        kind: entry.is_directory ? 'directory' : 'file',
                        size: entry.size,
                        modified: new Date(entry.modified).getTime(),
                    }));
                }
                catch {
                    return [];
                }
            },
        },
    };
}
//# sourceMappingURL=memory-adapter.js.map
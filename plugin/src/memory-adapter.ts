/**
 * Memory Adapter for OpenClaw
 *
 * Adapts CortexMemClient to OpenClaw's MemoryPluginCapability interface.
 * This allows MemClaw to function as a native OpenClaw memory plugin.
 */

import { CortexMemClient, type SearchResult, type Layer } from './client.js'

// =============================================================================
// OpenClaw Memory Types (from OpenClaw src/memory/types.ts)
// =============================================================================

export type MemorySource = 'memory' | 'sessions'

export type MemorySearchResult = {
  path: string
  startLine: number
  endLine: number
  score: number
  snippet: string
  source: MemorySource
  citation?: string
}

export type MemoryEmbeddingProbeResult = {
  ok: boolean
  error?: string
}

export type MemorySyncProgressUpdate = {
  completed: number
  total: number
  label?: string
}

export type MemoryProviderStatus = {
  backend: 'builtin' | 'cortex'
  provider: string
  model?: string
  requestedProvider?: string
  files?: number
  chunks?: number
  dirty?: boolean
  workspaceDir?: string
  dbPath?: string
  extraPaths?: string[]
  sources?: MemorySource[]
  sourceCounts?: Array<{ source: MemorySource; files: number; chunks: number }>
  cache?: { enabled: boolean; entries?: number; maxEntries?: number }
  fts?: { enabled: boolean; available: boolean; error?: string }
  fallback?: { from: string; reason?: string }
  vector?: {
    enabled: boolean
    available?: boolean
    extensionPath?: string
    loadError?: string
    dims?: number
  }
  batch?: {
    enabled: boolean
    failures: number
    limit: number
    wait: boolean
    concurrency: number
    pollIntervalMs: number
    timeoutMs: number
    lastError?: string
    lastProvider?: string
  }
  custom?: Record<string, unknown>
}

/**
 * MemorySearchManager interface compatible with OpenClaw
 */
export interface MemorySearchManager {
  search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string }
  ): Promise<MemorySearchResult[]>
  readFile(params: {
    relPath: string
    from?: number
    lines?: number
  }): Promise<{ text: string; path: string }>
  status(): MemoryProviderStatus
  sync?(params?: {
    reason?: string
    force?: boolean
    progress?: (update: MemorySyncProgressUpdate) => void
  }): Promise<void>
  probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult>
  probeVectorAvailability(): Promise<boolean>
  close?(): Promise<void>
}

// =============================================================================
// Memory Flush Plan Types
// =============================================================================

export type MemoryFlushPlan = {
  softThresholdTokens: number
  forceFlushTranscriptBytes: number
  reserveTokensFloor: number
  prompt: string
  systemPrompt: string
  relativePath: string
}

export type MemoryCitationsMode = 'auto' | 'on' | 'off'

// =============================================================================
// Runtime Backend Config Types
// =============================================================================

export type MemoryRuntimeBackendConfig = {
  backend: 'builtin' | 'cortex'
}

// =============================================================================
// CortexMemorySearchManager - Adapter Implementation
// =============================================================================

/**
 * Adapts CortexMemClient to OpenClaw's MemorySearchManager interface.
 * 
 * This allows MemClaw to be used as a drop-in replacement for OpenClaw's
 * built-in memory search, enabling seamless integration with the memory slot.
 */
export class CortexMemorySearchManager implements MemorySearchManager {
  private client: CortexMemClient
  private tenantId: string
  private defaultSessionKey: string
  private _status: MemoryProviderStatus
  private _closed = false

  /** Check if the manager has been closed */
  get closed(): boolean {
    return this._closed
  }

  constructor(options: {
    client: CortexMemClient
    tenantId: string
    defaultSessionKey?: string
  }) {
    this.client = options.client
    this.tenantId = options.tenantId
    this.defaultSessionKey = options.defaultSessionKey ?? 'default'
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
    }
  }

  /**
   * Search memories using Cortex Memory's tiered retrieval.
   * 
   * Converts Cortex search results to OpenClaw's MemorySearchResult format.
   */
  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string }
  ): Promise<MemorySearchResult[]> {
    if (this._closed) {
      throw new Error('MemorySearchManager is closed')
    }

    try {
      // Map sessionKey to Cortex scope
      const scope = this.resolveScope(opts?.sessionKey)
      
      const results = await this.client.search({
        query,
        scope,
        limit: opts?.maxResults ?? 10,
        min_score: opts?.minScore ?? 0.6,
        return_layers: ['L0'], // Use L0 for snippets (token-efficient)
      })

      return results.map((r) => this.toMemorySearchResult(r))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Cortex search failed: ${message}`)
    }
  }

  /**
   * Read a memory file by path.
   * 
   * Uses Cortex's filesystem API to read content.
   */
  async readFile(params: {
    relPath: string
    from?: number
    lines?: number
  }): Promise<{ text: string; path: string }> {
    if (this._closed) {
      throw new Error('MemorySearchManager is closed')
    }

    try {
      // Convert relative path to Cortex URI
      const uri = this.toCortexUri(params.relPath)
      
      // Get L2 full content
      const response = await this.client.getContent(uri)
      
      let text = response.content
      
      // Apply line range if specified
      if (params.from !== undefined || params.lines !== undefined) {
        const textLines = text.split('\n')
        const start = (params.from ?? 1) - 1 // Convert 1-indexed to 0-indexed
        const count = params.lines ?? textLines.length - start
        text = textLines.slice(start, start + count).join('\n')
      }

      return {
        text,
        path: params.relPath,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to read memory file: ${message}`)
    }
  }

  /**
   * Return the current memory provider status.
   */
  status(): MemoryProviderStatus {
    return { ...this._status }
  }

  /**
   * Sync is handled automatically by Cortex Memory service.
   * This is a no-op for compatibility.
   */
  async sync?(params?: {
    reason?: string
    force?: boolean
    progress?: (update: MemorySyncProgressUpdate) => void
  }): Promise<void> {
    // Cortex Memory handles sync internally via commit operations
    // No explicit sync needed
    return
  }

  /**
   * Check if embedding service is available.
   */
  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    try {
      // Try a simple search to probe availability
      await this.client.search({
        query: 'probe',
        limit: 1,
        min_score: 0,
        return_layers: ['L0'],
      })
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  }

  /**
   * Check if vector search is available.
   */
  async probeVectorAvailability(): Promise<boolean> {
    try {
      const result = await this.probeEmbeddingAvailability()
      return result.ok
    } catch {
      return false
    }
  }

  /**
   * Close the manager and release resources.
   */
  async close(): Promise<void> {
    this._closed = true
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Map OpenClaw sessionKey to Cortex scope URI.
   */
  private resolveScope(sessionKey?: string): string | undefined {
    if (!sessionKey) {
      return undefined // Search all memories
    }

    // sessionKey format: agentId or agentId/threadId
    const parts = sessionKey.split('/')
    if (parts.length === 1) {
      // Single agent ID - search within agent scope
      return `cortex://session/${sessionKey}`
    }
    
    // Agent and thread - search specific session
    return `cortex://session/${sessionKey}`
  }

  /**
   * Convert Cortex SearchResult to OpenClaw MemorySearchResult.
   */
  private toMemorySearchResult(result: SearchResult): MemorySearchResult {
    // Parse URI to get path
    // URI format: cortex://session/{id}/timeline/{idx}.md or similar
    const path = this.uriToPath(result.uri)
    
    return {
      path,
      startLine: 1,
      endLine: 1,
      score: result.score,
      snippet: result.snippet,
      source: this.inferSource(result.uri),
      citation: result.uri,
    }
  }

  /**
   * Convert Cortex URI to relative file path.
   */
  private uriToPath(uri: string): string {
    // cortex://session/{id}/timeline/{idx}.md -> session/{id}/timeline/{idx}.md
    const match = uri.match(/^cortex:\/\/(.+)$/)
    return match ? match[1] : uri
  }

  /**
   * Convert relative path to Cortex URI.
   */
  private toCortexUri(relPath: string): string {
    if (relPath.startsWith('cortex://')) {
      return relPath
    }
    return `cortex://${relPath}`
  }

  /**
   * Infer memory source from URI.
   */
  private inferSource(uri: string): MemorySource {
    if (uri.includes('/session/')) {
      return 'sessions'
    }
    return 'memory'
  }
}

// =============================================================================
// Manager Registry for Multi-Agent Support
// =============================================================================

/**
 * Global registry of active memory managers.
 * OpenClaw may request managers for different agents.
 */
const managerRegistry = new Map<string, CortexMemorySearchManager>()

/**
 * Get or create a memory search manager for an agent.
 */
export async function getMemorySearchManager(params: {
  serviceUrl: string
  tenantId: string
  agentId: string
  sessionKey?: string
}): Promise<{ manager: MemorySearchManager | null; error?: string }> {
  const cacheKey = `${params.tenantId}:${params.agentId}`
  
  // Return cached manager if available
  const cached = managerRegistry.get(cacheKey)
  if (cached && !cached.closed) {
    return { manager: cached }
  }

  try {
    const client = new CortexMemClient(params.serviceUrl)
    
    // Switch to the tenant
    await client.switchTenant(params.tenantId)
    
    const manager = new CortexMemorySearchManager({
      client,
      tenantId: params.tenantId,
      defaultSessionKey: params.sessionKey,
    })
    
    managerRegistry.set(cacheKey, manager)
    
    return { manager }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { manager: null, error: message }
  }
}

/**
 * Close all active memory managers.
 */
export async function closeAllMemorySearchManagers(): Promise<void> {
  const closePromises = Array.from(managerRegistry.values()).map(async (manager) => {
    try {
      await manager.close?.()
    } catch {
      // Ignore close errors
    }
  })
  
  await Promise.all(closePromises)
  managerRegistry.clear()
}

// =============================================================================
// Memory Plugin Capability Types (for registerMemoryCapability)
// =============================================================================

/**
 * Build the system prompt section for memory guidance.
 */
export type MemoryPromptSectionBuilder = (params: {
  availableTools: Set<string>
  citationsMode?: MemoryCitationsMode
}) => string[]

/**
 * Resolve the memory flush plan for compaction.
 */
export type MemoryFlushPlanResolver = (params: {
  cfg?: unknown
  nowMs?: number
}) => MemoryFlushPlan | null

/**
 * Memory plugin runtime interface.
 */
export type MemoryPluginRuntime = {
  getMemorySearchManager(params: {
    cfg: unknown
    agentId: string
    purpose?: 'default' | 'status'
  }): Promise<{ manager: MemorySearchManager | null; error?: string }>
  resolveMemoryBackendConfig(params: {
    cfg: unknown
    agentId: string
  }): MemoryRuntimeBackendConfig
  closeAllMemorySearchManagers?(): Promise<void>
}

/**
 * Public artifacts provider for memory data export.
 */
export type MemoryPluginPublicArtifactsProvider = {
  listArtifacts(params: { cfg: unknown }): Promise<MemoryPluginPublicArtifact[]>
}

export type MemoryPluginPublicArtifact = {
  uri: string
  name: string
  kind: 'file' | 'directory'
  size?: number
  modified?: number
}

/**
 * Complete memory plugin capability for registerMemoryCapability.
 */
export type MemoryPluginCapability = {
  promptBuilder?: MemoryPromptSectionBuilder
  flushPlanResolver?: MemoryFlushPlanResolver
  runtime?: MemoryPluginRuntime
  publicArtifacts?: MemoryPluginPublicArtifactsProvider
}

// =============================================================================
// Memory Plugin Capability Factory Functions (OpenClaw Official APIs)
// =============================================================================

/**
 * Create memory prompt section builder for api.registerMemoryPromptSection.
 * 
 * This builds the system prompt section that guides agents on using Cortex Memory.
 */
export function createMemoryPromptSectionBuilder(): MemoryPromptSectionBuilder {
  return ({ availableTools, citationsMode }) => {
    if (!availableTools.has('cortex_search')) {
      return []
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
    ]

    if (citationsMode !== 'off') {
      lines.push('Citations are enabled. Search results include `citation` fields.')
      lines.push('')
    }

    return lines
  }
}

/**
 * Create memory flush plan resolver for api.registerMemoryFlushPlan.
 * 
 * This determines when and how to flush memory during compaction.
 */
export function createMemoryFlushPlanResolver(): MemoryFlushPlanResolver {
  return ({ cfg, nowMs }) => {
    return {
      softThresholdTokens: 8000,
      forceFlushTranscriptBytes: 100000,
      reserveTokensFloor: 2000,
      prompt: 'Cortex memory flush',
      systemPrompt: 'Summarize and extract memories from the conversation.',
      relativePath: 'cortex/memory.md',
    }
  }
}

/**
 * Create memory runtime for api.registerMemoryRuntime.
 * 
 * This provides the MemorySearchManager implementation that OpenClaw uses
 * for memory operations.
 */
export function createMemoryRuntime(options: {
  serviceUrl: string
  tenantId: string
}): MemoryPluginRuntime {
  return {
    getMemorySearchManager: async ({ cfg, agentId, purpose }) => {
      // Extract config from cfg (OpenClawConfig)
      const config = cfg as {
        plugins?: {
          entries?: Record<string, { config?: Record<string, unknown> }>
        }
      }

      const pluginConfig = config?.plugins?.entries?.['memclaw']?.config ?? {}
      const serviceUrl = (pluginConfig.serviceUrl as string) ?? options.serviceUrl
      const tenantId = (pluginConfig.tenantId as string) ?? options.tenantId

      return getMemorySearchManager({
        serviceUrl,
        tenantId,
        agentId,
      })
    },

    resolveMemoryBackendConfig: ({ cfg, agentId }) => {
      return {
        backend: 'cortex',
      }
    },

    closeAllMemorySearchManagers,
  }
}

/**
 * @deprecated Use createMemoryPromptSectionBuilder, createMemoryFlushPlanResolver, 
 * and createMemoryRuntime instead. This function is kept for backward compatibility.
 * 
 * Create the MemoryPluginCapability object for legacy registerMemoryCapability.
 */
export function createMemoryPluginCapability(options: {
  serviceUrl: string
  tenantId: string
}): MemoryPluginCapability {
  return {
    promptBuilder: createMemoryPromptSectionBuilder(),
    flushPlanResolver: createMemoryFlushPlanResolver(),
    runtime: createMemoryRuntime(options),
    publicArtifacts: {
      listArtifacts: async ({ cfg }) => {
        const config = cfg as {
          plugins?: {
            entries?: Record<string, { config?: Record<string, unknown> }>
          }
        }

        const pluginConfig = config?.plugins?.entries?.['memclaw']?.config ?? {}
        const serviceUrl = (pluginConfig.serviceUrl as string) ?? options.serviceUrl
        const tenantId = (pluginConfig.tenantId as string) ?? options.tenantId

        try {
          const client = new CortexMemClient(serviceUrl)
          await client.switchTenant(tenantId)

          const lsResult = await client.ls({
            uri: 'cortex://session',
            recursive: true,
          })

          return lsResult.entries.map((entry) => ({
            uri: entry.uri,
            name: entry.name,
            kind: entry.is_directory ? 'directory' as const : 'file' as const,
            size: entry.size,
            modified: new Date(entry.modified).getTime(),
          }))
        } catch {
          return []
        }
      },
    },
  }
}

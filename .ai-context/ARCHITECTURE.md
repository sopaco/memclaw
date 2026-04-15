# Architecture — MemClaw

> Detailed component relationships, API dependencies, and design rationale. Last updated: 2026-04-04.

---

## Component Map

```
memclaw/
│
├── plugin/                          # @memclaw/memclaw (v0.9.36)
│   ├── index.ts                     #   Plugin entry: exports default + named plugin
│   ├── plugin-impl.ts               #   Core: service lifecycle, 11 tools, AGENTS.md injector
│   ├── src/
│   │   ├── client.ts                #   HTTP client for cortex-mem-service (search, ls, tiered access)
│   │   ├── config.ts                #   TOML config management, plugin sync, validation
│   │   ├── binaries.ts              #   Platform detection, Qdrant/service start/stop, CLI execution
│   │   ├── migrate.ts               #   OpenClaw native memory → MemClaw migration
│   │   └── agents-md-injector.ts    #   Auto-inject MemClaw section into AGENTS.md
│   └── skills/                      #   Agent-facing skill docs (shipped with plugin)
│
├── context-engine/                  # @memclaw/context-engine
│   ├── index.ts                     #   Plugin entry: service + context engine + tools registration
│   ├── context-engine.ts            #   Core: ingest/assemble/afterTurn/compact lifecycle
│   ├── client.ts                    #   HTTP client (simpler than plugin's — fewer methods needed)
│   ├── tools.ts                     #   9 tool definitions
│   ├── config.ts                    #   Context-engine-specific config defaults
│   └── binaries.ts                  #   Binary/service management (duplicated logic from plugin)
│
├── bin-darwin-arm64/                # @memclaw/bin-darwin-arm64 (v0.1.9)
├── bin-linux-x64/                   # @memclaw/bin-linux-x64 (v0.1.9)
├── bin-win-x64/                     # @memclaw/bin-win-x64 (v0.1.9)
│
└── (root AGENTS.md, README.md)
```

---

## Runtime Dependency Chain

```
OpenClaw Gateway (≥ 2026.3.8)
    │
    ├── loads plugin (@memclaw/memclaw) ──────────────┐
    │   └── depends on @memclaw/bin-{platform}        │
    │                                                  │
    ├── loads context-engine (@memclaw/context-engine) │
    │   └── depends on @memclaw/bin-{platform}         │
    │                                                  │
    └────────────────────────────────┬─────────────────┘
                                     │
                                     ▼
                    cortex-mem-service (port 8085)
                    (binary from @memclaw/bin-*)
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                                 ▼
         Qdrant (6333/6334)              Local filesystem
         (binary from @memclaw/bin-*)    (Markdown via cortex:// URIs)
```

### Version Relationships

| Package | Version | Depends On |
|---------|---------|-----------|
| `@memclaw/memclaw` | 0.9.36 | `@memclaw/bin-*` (0.1.9) |
| `@memclaw/context-engine` | 0.9.61 | `@memclaw/bin-*` (same versions) |
| `@memclaw/bin-darwin-arm64` | 0.1.9 | — |
| `@memclaw/bin-linux-x64` | 0.1.9 | — |
| `@memclaw/bin-win-x64` | 0.1.9 | — |

Binary versions are updated independently when upstream Cortex Memory or Qdrant releases new builds.

---

## API Dependencies

Both plugins communicate with `cortex-mem-service` via HTTP REST API (`/api/v2/*`).

### Required Endpoints

| Endpoint | Method | Used By | Purpose |
|----------|--------|---------|---------|
| `/api/v2/sessions` | POST | Both | Create a new session |
| `/api/v2/sessions` | GET | plugin | List sessions |
| `/api/v2/sessions/{id}/messages` | POST | Both | Add message to session timeline |
| `/api/v2/sessions/{id}/close` | POST | Both | Close session → trigger memory extraction |
| `/api/v2/sessions/{id}/close-and-wait` | POST | Both | Sync close + wait for extraction |
| `/api/v2/search` | POST | Both | Layered semantic search |
| `/api/v2/filesystem/list` | GET | Both | List directory contents |
| `/api/v2/filesystem/read/<path>` | GET | Both | Read file content |
| `/api/v2/filesystem/abstract` | GET | Both | Get L0 abstract |
| `/api/v2/filesystem/overview` | GET | Both | Get L1 overview |
| `/api/v2/filesystem/content` | GET | Both | Get L2 full content |
| `/api/v2/filesystem/explore` | POST | plugin | Smart exploration |
| `/api/v2/tenants/switch` | POST | Both | Switch tenant context |

### Expected but May Not Exist

| Endpoint | Method | Purpose | Fallback |
|----------|--------|---------|----------|
| `/api/v2/sessions/{id}/messages/bulk` | POST | Batch message write | Falls back to individual `POST /messages` per message |

---

## Key Design Decisions

### 1. Pre-compiled Binaries Over Runtime Build

**Decision**: Distribute Qdrant and cortex-mem-service as pre-compiled binaries via platform-specific NPM packages.

**Rationale**:
- Zero external dependencies for end users — `npm install` is sufficient
- No need for users to understand Qdrant collection setup or Cortex Memory configuration
- Version-locked: binary package version guarantees compatible service/API behavior
- Tradeoff: larger install size (~50-100MB per platform), but only one platform is installed per user

### 2. Dual Plugin Strategy

**Decision**: Maintain two separate plugins (Memory Plugin + Context Engine) rather than a single combined plugin.

**Rationale**:
- Different OpenClaw plugin kinds (`memory` vs `context-engine`) have different lifecycles and capabilities
- Users can choose their preferred interaction model (manual tools vs automatic lifecycle hooks)
- They share the same backend and can coexist
- Tradeoff: duplicated code in `binaries.ts` and `client.ts` between the two subprojects

### 3. config.toml + openclaw.json Dual Config

**Decision**: Maintain a `config.toml` on disk while also accepting config from OpenClaw plugin settings, with plugin settings taking precedence.

**Rationale**:
- `config.toml` is needed for direct CLI usage (cortex-mem-cli)
- `openclaw.json` provides a user-friendly UI for configuration
- Sync from plugin → TOML ensures CLI and plugin use consistent settings

### 4. ownsCompaction: false (Context Engine)

**Decision**: The Context Engine delegates compaction to OpenClaw's built-in algorithm.

**Rationale**:
- Cortex Memory's compaction (archiving) is handled via `closeSession()`, not in-band with OpenClaw's context window management
- Implementing custom compaction would require duplicating OpenClaw's context trimming logic
- Tradeoff: less control over exactly when/how context is trimmed

---

## Data Flow — Core Operations

### Message Write (Context Engine)

```
User message → ingest() → buffer.pendingMessages.push()
                          buffer.pendingTokens += chars / 4
                          
After model responds → afterTurn()
                       → buffer.pendingMessages.splice(0)
                       → client.addMessages(sessionId, batch)
                         → POST /sessions/{id}/messages (bulk, or fallback: per-message)
                       → shouldTriggerCommit()?
                         → triggerCommitAsync()
                           → client.closeSession(sessionId, false)
                             → POST /sessions/{id}/close
```

### Auto Recall (Context Engine)

```
Before model runs → assemble()
                    → extractRecentUserTexts(messages, recallWindow=5)
                    → query = join(userTexts)
                    → isSimilarQuery(query, state.lastQuery)? → skip if overlap ≥ 0.7
                    → cooldown check (60s)? → skip
                    → client.search({ query, return_layers: ["L0"] })
                    → inject as simulated toolCall + toolResult
                    → return { messages, estimatedTokens, systemPromptAddition }
```

### Manual Search (Memory Plugin)

```
Agent calls cortex_search → ensureServicesReady()
                          → client.search({ query, return_layers, limit, min_score })
                            → POST /api/v2/search
                          → format results with score, URI, snippet, layers
                          → return formatted output
```

---

## State Management

| State | Where | Persistence |
|-------|-------|-------------|
| Session buffers (pending messages) | In-memory (Map) | Lost on restart — by design |
| Recall state (last query, cooldown) | In-memory (Map) | Lost on restart — by design |
| config.toml | Disk (platform-specific path) | Persistent |
| Memory files | Disk (`cortex://` URIs → filesystem) | Persistent |
| Qdrant vectors | Disk (Qdrant storage) | Persistent |
| Service processes | OS processes | Lost on restart — restarted by plugin |

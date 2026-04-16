# Architecture — Component Relationships

> How components fit together. Last updated: 2026-04-16 (Audit completed).
>
> **Update this when:** New component added, responsibilities shift, data flow changes.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
│                                                                   │
│  ┌───────────────────┐     ┌────────────────────────┐           │
│  │   Memory Plugin   │     │    Context Engine      │           │
│  │   (plugin/)       │     │    (context-engine/)   │           │
│  │                   │     │                        │           │
│  │ • 12 manual tools │     │ • Auto lifecycle hooks │           │
│  │ • Explicit calls  │     │ • Transparent recall   │           │
│  └────────┬──────────┘     └───────────┬────────────┘           │
│           │                            │                         │
│           └────────────┬───────────────┘                         │
│                        │ HTTP REST API                           │
│                        ▼                                         │
│           ┌────────────────────────┐                            │
│           │  cortex-mem-service    │ ← Port 8085                │
│           │  (Memory backend)       │                            │
│           └────────────┬───────────┘                            │
│                        │                                         │
│           ┌────────────┼────────────┐                           │
│           ▼            ▼            ▼                           │
│    ┌───────────┐ ┌────────────┐ ┌─────────────┐                │
│    │  Qdrant   │ │ Filesystem │ │ LLM/Embed   │                │
│    │  :6333    │ │ (Markdown) │ │   APIs      │                │
│    └───────────┘ └────────────┘ └─────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Two Plugins, One Backend

Both plugins share the same backend but serve different interaction models:

| Aspect | Memory Plugin | Context Engine |
|--------|--------------|----------------|
| OpenClaw `kind` | `"memory"` | `"context-engine"` |
| Interaction | Agent calls tools explicitly | Automatic lifecycle hooks |
| Control | Full control over when/what | Transparent to agent |
| Use case | Complex queries, maintenance | Always-on memory |

**They can be installed together** — no conflict since they share the backend.

---

## Component Responsibilities

### plugin/
- **Entry:** `index.ts` → `plugin-impl.ts`
- **Tools:** 12 tools (`cortex_search`, `cortex_add_memory`, `cortex_commit_session`, etc.)
- **Key behaviors:**
  - Starts/stops Qdrant and cortex-mem-service on demand
  - Injects MemClaw section into workspace `AGENTS.md`
  - Provides migration from OpenClaw native memory
  - Syncs config from `openclaw.json` → `config.toml`

### context-engine/
- **Entry:** `index.ts` → `context-engine.ts`
- **Lifecycle hooks:**
  - `ingest()` — buffer messages locally
  - `assemble()` — auto-recall relevant memories
  - `afterTurn()` — batch write, evaluate commit triggers
  - `compact()` — flush buffers, close session
- **Key behaviors:**
  - 60s recall cooldown (per session)
  - 70% query overlap dedup
  - Auto-commit triggers: 50k tokens / 20 messages / 30min

### bin-{platform}/
- Pre-compiled binaries distributed via NPM
- Contains: `qdrant`, `cortex-mem-service`, `cortex-mem-cli`
- Selected at runtime by `process.platform` + `process.arch`

### cortex-mem-service (backend)
- HTTP REST API on port 8085
- Manages sessions, memory extraction, vector indexing
- Stores memories as Markdown files (cortex:// URI scheme)
- Uses Qdrant for vector search

---

## Data Flow

### Write Path (Context Engine)
```
User message
    → ingest() → local buffer
    → afterTurn() → batch write to cortex-mem-service
    → closeSession() triggers memory extraction (L0/L1/L2 layers)
```

### Read Path (Both)
```
Search query
    → cortex-mem-service
    → Qdrant vector search
    → Return ranked results with L0/L1/L2 layers
```

### Recall Flow (Context Engine auto)
```
assemble() called
    → extract recent user texts (last 5 messages)
    → check cooldown + dedup
    → if allowed: search with L0 results
    → inject as simulated tool call/result
```

---

## Key Design Patterns

### 1. Tiered Memory (L0/L1/L2)
- **L0 (~100 tokens):** Abstract for quick relevance check
- **L1 (~2000 tokens):** Overview for understanding core info
- **L2 (full):** Complete original content

Agent should start with L0, then request L1/L2 as needed.

### 2. Session-Based Memory
Memory is organized by sessions (thread_id). A session must be closed to trigger memory extraction. Context Engine manages this automatically; Plugin requires explicit `cortex_commit_session`.

### 3. Tenant Isolation
`tenantId` separates data spaces. Default is `tenant_claw`. Different tenants = completely isolated memory collections.

---

## Configuration Layers

```
openclaw.json (plugin settings)
    ↓ sync on start
config.toml (disk config)
    ↓ read by
cortex-mem-service
```

Precedence: `openclaw.json` > `config.toml` > hardcoded defaults

---

## Dependencies

| Package | Purpose | Version Constraint |
|---------|---------|-------------------|
| OpenClaw Gateway | Runtime platform | ≥ 2026.3.8 |
| `@memclaw/bin-*` | Platform binaries | ^0.1.9 |
| Node.js | Runtime | ≥ 20.0.0 |

---

*This file describes component relationships. For detailed API contracts, explore the source code or use `grep`.*
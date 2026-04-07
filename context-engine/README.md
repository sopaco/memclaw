# @memclaw/memclaw-context-engine — Context Engine

[![npm version](https://img.shields.io/npm/v/@memclaw/memclaw-context-engine.svg)](https://www.npmjs.com/package/@memclaw/memclaw-context-engine)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-compatible-brightgreen)](https://github.com/openclaw/openclaw)

Native context engine for OpenClaw with automatic memory recall, message capture, and smart compaction — all powered by Cortex Memory.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
  - [Lifecycle Hooks](#lifecycle-hooks)
  - [Key Design Decisions](#key-design-decisions)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
  - [Requirements](#requirements)
  - [From npm](#from-npm)
  - [Local Development](#local-development)
- [Configuration](#configuration)
  - [Plugin Configuration](#plugin-configuration)
  - [Configuration Options](#configuration-options)
- [Available Tools](#available-tools)
- [Auto Recall](#auto-recall)
  - [How It Works](#how-auto-recall-works)
  - [Cooldown & Deduplication](#cooldown--deduplication)
- [Auto Capture](#auto-capture)
  - [Commit Trigger Conditions](#commit-trigger-conditions)
- [Session ID Mapping](#session-id-mapping)
- [Memory Plugin vs Context Engine](#memory-plugin-vs-context-engine)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [Technical Design](#technical-design)
- [License](#license)

---

## Overview

The MemClaw Context Engine is an OpenClaw **Context Engine plugin** (`kind: "context-engine"`) that transforms how your AI agent manages conversation context. Instead of relying on the agent to explicitly call memory tools, the Context Engine hooks into OpenClaw's lifecycle to **automatically recall relevant memories, capture messages, and trigger memory extraction** — all transparently.

Think of it as the difference between manually searching your notes (Memory Plugin) and having an assistant who proactively brings you the right files before you even ask (Context Engine).

---

## How It Works

### Lifecycle Hooks

The Context Engine implements four lifecycle hooks that OpenClaw calls at specific points:

| Hook | Triggered When | What It Does |
|------|---------------|--------------|
| **`ingest()`** | A new message is added to the session | Buffers the message locally (no network calls) |
| **`assemble()`** | Before the model runs | Auto-recalls relevant memories, injects them as simulated tool results, returns assembled context |
| **`afterTurn()`** | After the model responds | Batch-writes pending messages to Cortex Memory, evaluates whether to auto-commit |
| **`compact()`** | Context window is full or `/compact` is called | Flushes remaining messages, closes the session to trigger memory extraction |

### Key Design Decisions

| Decision | Value | Rationale |
|----------|-------|-----------|
| `ownsCompaction` | `false` | Delegates compaction to OpenClaw's built-in algorithm; avoids reinventing compression |
| Recall cooldown | 60 seconds | Prevents redundant searches on rapid successive turns |
| Query dedup threshold | 70% word overlap | Skips recall if the query is too similar to the last one |
| Recall layers | `["L0"]` only | Minimizes token overhead; agent can escalate to L1/L2 via tools if needed |
| Message writes | Batched per turn | Reduces HTTP calls to cortex-mem-service |
| Commit evaluation | Local state (no API) | Checks token count, message count, and time interval without network calls |
| Commit trigger | Fire-and-forget async | Doesn't block the current turn |

---

## Features

- **Automatic Memory Recall** — Before each model invocation, relevant memories are automatically retrieved and injected into the context as simulated `cortex_search` tool results
- **Automatic Message Capture** — Every conversation turn is silently written to Cortex Memory, no explicit `cortex_add_memory` calls needed
- **Smart Commit Triggering** — Sessions are automatically committed when accumulated tokens, message count, or time interval thresholds are met
- **Query Deduplication** — Avoids redundant searches by comparing the current query to the last one (word overlap >= 70%)
- **Recall Cooldown** — Prevents excessive API calls by enforcing a 60-second minimum between recalls per session
- **Session ID Mapping** — Safe cross-platform session ID handling with SHA-256 hashing for Windows filesystem compatibility
- **Graceful Degradation** — If cortex-mem-service is unavailable, assemble falls back to returning original messages unchanged
- **Cross-Platform** — Windows x64, macOS Apple Silicon, Linux x64
- **Zero External Dependencies** — Qdrant and cortex-mem-service are pre-compiled and bundled

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  OpenClaw Gateway                                             │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Context Engine Lifecycle                             │    │
│  │                                                       │    │
│  │  ingest()    ──────────────────────────────┐         │    │
│  │    Buffer messages locally (no network)     │         │    │
│  │                                             │         │    │
│  │  assemble()  ───────────────────────┐      │         │    │
│  │    Auto-recall (cooldown + dedup)   │      │         │    │
│  │    Inject as simulated tool results  │      │         │    │
│  │    Return assembled context          │      │         │    │
│  │                                      │      │         │    │
│  │  afterTurn()  ───────────────┐      │      │         │    │
│  │    Batch write messages      │      │      │         │    │
│  │    Evaluate commit trigger   │      │      │         │    │
│  │    Fire-and-forget commit    │      │      │         │    │
│  │                               │      │      │         │    │
│  │  compact()  ─────────┐      │      │      │         │    │
│  │    Flush remaining    │      │      │      │         │    │
│  │    Close session      │      │      │      │         │    │
│  │                        │      │      │      │         │    │
│  └────────────────────────┼──────┼──────┼──────┼─────────┘    │
│                           │      │      │      │               │
│  ┌────────────────────────┼──────┼──────┼──────┼─────────┐    │
│  │  Available Tools       │      │      │      │         │    │
│  │                         │      │      │      │         │    │
│  │  cortex_search ◄────────┘      │      │      │         │    │
│  │  cortex_recall                 │      │      │         │    │
│  │  cortex_add_memory             │      │      │         │    │
│  │  cortex_commit_session         │      │      │         │    │
│  │  cortex_ls                     │      │      │         │    │
│  │  cortex_get_abstract           │      │      │         │    │
│  │  cortex_get_overview           │      │      │         │    │
│  │  cortex_get_content            │      │      │         │    │
│  │  cortex_forget                 │      │      │         │    │
│  └────────────────────────────────┼──────┼──────┼─────────┘    │
│                                   │      │      │               │
│                                   ▼      ▼      ▼               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  cortex-mem-service (HTTP REST API, port 8085)          │   │
│  │                                                          │   │
│  │  POST /api/v2/sessions/{id}/messages   Write messages    │   │
│  │  POST /api/v2/sessions/{id}/close      Close & extract   │   │
│  │  POST /api/v2/search                   Semantic search   │   │
│  │  GET  /api/v2/filesystem/*             Filesystem browse  │   │
│  │  POST /api/v2/tenants/switch           Tenant switching   │   │
│  │                                                          │   │
│  └──────────────────────┬─────────────────────────────────┘   │
│                         │                                      │
│          ┌──────────────┴──────────────┐                      │
│          ▼                             ▼                      │
│  ┌───────────────┐          ┌────────────────────┐           │
│  │  Local FS      │          │  Qdrant             │           │
│  │  (Markdown)    │          │  (Vector Index)     │           │
│  └───────────────┘          └────────────────────┘           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Installation

### Requirements

| Requirement | Details |
|-------------|---------|
| **Platforms** | Windows x64, macOS Apple Silicon, Linux x64 |
| **Node.js** | ≥ 20.0.0 |
| **OpenClaw** | ≥ 2026.3.8 (installed and configured) |
| **LLM API** | OpenAI-compatible API key |
| **Embedding API** | OpenAI-compatible Embedding API key |

### From npm

```bash
openclaw plugins install @memclaw/memclaw-context-engine
```

Then configure in `openclaw.json`:

```jsonc
{
  "plugins": {
    "entries": {
      "memclaw-context-engine": {
        "enabled": true,
        "config": {
          "tenantId": "tenant_claw",
          "autoStartServices": true,
          "autoRecall": true,
          "autoCapture": true,
          "llmApiKey": "your-llm-api-key",
          "llmModel": "gpt-5-mini",
          "embeddingApiKey": "your-embedding-api-key",
          "embeddingModel": "text-embedding-3-small"
        }
      }
    },
    "slots": {
      "contextEngine": "memclaw-context-engine"
    }
  },
  "agents": {
    "defaults": {
      "memorySearch": { "enabled": false }
    }
  }
}
```

> The `plugins.slots.contextEngine` setting is required to activate the Context Engine. Without it, the plugin will load but OpenClaw will use its default legacy engine.

### Local Development

```bash
git clone https://github.com/sopaco/memclaw.git
cd memclaw/context-engine

# Install dependencies
bun install

# Build
bun run build
```

Use `plugins.load.paths` in `openclaw.json` to point to the local build output:

```jsonc
{
  "plugins": {
    "load": {
      "paths": ["/path/to/memclaw/context-engine"]
    },
    "entries": {
      "memclaw-context-engine": { "enabled": true }
    }
  }
}
```

After code changes, rebuild with `bun run build` and restart OpenClaw.

---

## Configuration

### Plugin Configuration

On first run, the Context Engine creates a `config.toml` file at a platform-specific location:

| Platform | Config Path |
|----------|------------|
| macOS | `~/Library/Application Support/memclaw/config.toml` |
| Windows | `%LOCALAPPDATA%\memclaw\config.toml` |
| Linux | `~/.local/share/memclaw/config.toml` |

The file is automatically opened in your default editor for you to fill in API keys. Plugin settings in `openclaw.json` take precedence.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceUrl` | string | `http://localhost:8085` | Cortex Memory service URL |
| `tenantId` | string | `tenant_claw` | Tenant ID for data isolation |
| `autoStartServices` | boolean | `true` | Auto-start Qdrant and cortex-mem-service |
| **Auto Recall** | | | |
| `autoRecall` | boolean | `true` | Enable automatic memory recall during assembly |
| `recallWindow` | number | `5` | Recent user turns to construct the search query |
| `recallLimit` | number | `10` | Maximum memories to recall |
| `recallMinScore` | number | `0.65` | Minimum relevance score (0-1) |
| `recallTokenBudget` | number | `2000` | Token budget for recalled memories |
| **Auto Capture** | | | |
| `autoCapture` | boolean | `true` | Enable automatic message capture after each turn |
| `commitTokenThreshold` | number | `50000` | Token threshold to trigger auto-commit |
| `commitTurnThreshold` | number | `20` | Turn count threshold to trigger auto-commit |
| `commitIntervalMs` | number | `1800000` (30 min) | Maximum interval between commits |
| **LLM / Embedding** | | | |
| `llmApiBaseUrl` | string | `https://api.openai.com/v1` | LLM API endpoint |
| `llmApiKey` | string | — | LLM API key (**required**) |
| `llmModel` | string | `gpt-5-mini` | LLM model name |
| `embeddingApiBaseUrl` | string | `https://api.openai.com/v1` | Embedding API endpoint |
| `embeddingApiKey` | string | — | Embedding API key (**required**) |
| `embeddingModel` | string | `text-embedding-3-small` | Embedding model name |

---

## Available Tools

The Context Engine registers the following tools for explicit agent use alongside the automatic lifecycle hooks:

| Tool | Purpose |
|------|---------|
| `cortex_search` | Layered semantic search with L0/L1/L2 control |
| `cortex_recall` | Quick recall returning L0 snippet + L2 content |
| `cortex_add_memory` | Explicitly store a message with metadata |
| `cortex_commit_session` | Manually commit a session and trigger extraction |
| `cortex_ls` | Browse the memory virtual filesystem |
| `cortex_get_abstract` | Get L0 abstract (~100 tokens) |
| `cortex_get_overview` | Get L1 overview (~2000 tokens) |
| `cortex_get_content` | Get L2 full content |
| `cortex_forget` | Delete a memory by URI |

---

## Auto Recall

### How Auto Recall Works

Every time OpenClaw calls `assemble()` (before each model invocation), the Context Engine:

1. **Extracts recent user texts** from the last `recallWindow` (default: 5) user turns
2. **Constructs a search query** by joining them
3. **Checks deduplication** — skips if the query overlaps >= 70% with the last query for this session
4. **Checks cooldown** — skips if the last recall was within 60 seconds
5. **Searches Cortex Memory** via `cortex-mem-service` with `return_layers: ["L0"]`
6. **Injects results** as a simulated `cortex_search` tool call + tool result pair before the active messages
7. **Adds system prompt guidance** explaining how the model should use the recalled context

### Injected Context Format

```
[User: cortex_search — query: "database architecture decisions"]

Found 3 relevant memories:

1. [Score: 0.87] cortex://session/abc123/timeline/2024-01-15_003.abstract.md
   Discussion about moving from PostgreSQL to SQLite for local storage...

2. [Score: 0.72] cortex://user/default/preferences/database-preference.abstract.md
   User preference for PostgreSQL over MySQL...
```

### Cooldown & Deduplication

| Mechanism | Threshold | Purpose |
|-----------|-----------|---------|
| Cooldown | 60 seconds per session | Prevents API spam on rapid turns |
| Query dedup | 70% word overlap | Avoids re-searching for nearly identical queries |

Both mechanisms operate **per session**, so different sessions have independent recall state.

---

## Auto Capture

### How Auto Capture Works

Every time OpenClaw calls `afterTurn()` (after each model response), the Context Engine:

1. **Extracts new messages** from the current turn (user and assistant text)
2. **Batch-writes** them to cortex-mem-service in a single HTTP call
3. **Evaluates commit trigger** based on local state (no network calls needed)

### Commit Trigger Conditions

A session is auto-committed when **any** of these conditions is met:

| Condition | Default Threshold | What It Measures |
|-----------|------------------|------------------|
| Token count | `pendingTokens >= 50000` | Enough content has accumulated |
| Turn count | `messageCount >= 20` | Enough conversation rounds |
| Time interval | `lastCommitAt + 30 min < now` | Too long since last commit |

The commit is **fire-and-forget async** — it does not block the current turn. If a commit is already in progress, the next evaluation is skipped.

---

## Session ID Mapping

OpenClaw uses UUID-format session IDs, which may contain characters unsafe for Windows filesystem paths. The Context Engine maps them to Cortex Memory session IDs:

| OpenClaw Session ID | Cortex Session ID | Method |
|---------------------|-------------------|--------|
| Valid UUID (`a1b2c3...`) | Same UUID (lowercase) | Direct pass-through |
| `sessionKey` provided | SHA-256 hex digest of key | Hash-based |
| Contains unsafe chars | SHA-256 hex digest of `openclaw-session:{id}` | Hash-based fallback |

This ensures memory files are safely stored across all platforms.

---

## Memory Plugin vs Context Engine

| Aspect | Memory Plugin (`@memclaw/memclaw`) | Context Engine (`@memclaw/memclaw-context-engine`) |
|--------|-----------------------------------|-------------------------------------------|
| **Kind** | `memory` | `context-engine` |
| **Mode** | Passive — agent must call tools | Active — lifecycle hooks drive everything |
| **Memory write** | Manual (`cortex_add_memory`) | Automatic (`afterTurn` batch capture) |
| **Memory recall** | Manual (`cortex_search`) | Automatic (`assemble` auto-recall) |
| **Session commit** | Manual (`cortex_commit_session`) | Automatic (token/turn/time thresholds) |
| **Compaction** | OpenClaw built-in | OpenClaw built-in (`ownsCompaction: false`) |
| **Best for** | Users who want full control | Users who want "it just works" automation |
| **Can coexist** | Yes | Yes — they share the same backend |

**Can I use both?** Yes. They operate independently and share the same cortex-mem-service backend. The Context Engine handles automatic operations while the Memory Plugin's tools remain available for explicit agent use. However, in most cases, installing just the Context Engine is sufficient.

---

## Troubleshooting

### Context Engine Not Activating

1. Verify `plugins.slots.contextEngine` is set to `"memclaw-context-engine"` in `openclaw.json`
2. Check that `"enabled": true` is set in the plugin entry
3. Run `openclaw doctor` to validate plugin loading

### Auto Recall Not Returning Memories

1. Ensure `autoRecall: true` in config
2. Check that there is existing memory data (use `cortex_ls` to browse)
3. Verify cortex-mem-service is running: `curl http://localhost:8085/health`
4. The recall uses L0-only by design — results will be brief; use `cortex_search` with `["L0","L1","L2"]` for full detail

### Auto Commit Not Triggering

1. Check thresholds: tokens >= 50000, messages >= 20, or interval >= 30 min
2. Ensure `autoCapture: true` in config
3. Verify cortex-mem-service is reachable
4. Commit state resets on error — a failed commit will be retried on the next evaluation

### Services Won't Start

1. Check ports **6333** (Qdrant HTTP), **6334** (Qdrant gRPC), **8085** (cortex-mem-service)
2. Set `autoStartServices: false` to manage services externally
3. Verify binary packages are installed: `npm ls @memclaw/bin-darwin-arm64` (or your platform)

### First-Run Config File Created But Empty

1. The config file is auto-opened in your default editor — fill in `llm.api_key` and `embedding.api_key`
2. Save the file and restart OpenClaw
3. Alternatively, set these values directly in `openclaw.json` under `plugins.entries.memclaw-context-engine.config`

---

## Project Structure

```
context-engine/
├── index.ts                    # Plugin entry: service registration, context engine + tools
├── context-engine.ts           # ContextEngine class: ingest/assemble/afterTurn/compact
├── client.ts                   # CortexMemClient: HTTP API wrapper for cortex-mem-service
├── config.ts                   # Config: defaults, TOML generation, parsing, validation
├── binaries.ts                 # Binary resolution & service lifecycle management
├── tools.ts                    # Tool definitions (9 tools for explicit agent use)
├── package.json                # NPM package manifest (@memclaw/memclaw-context-engine)
├── openclaw.plugin.json        # OpenClaw plugin manifest (kind: context-engine, configSchema)
├── tsconfig.json               # TypeScript config (ES2022, NodeNext, strict)
├── bun.lock                    # Bun lockfile
├── TECH_DESIGN.md              # Comprehensive technical design document (927 lines)
│
├── .ai-context/
│   └── CONTEXT_ENGINE.md       # Agent-facing reference: architecture, decisions, APIs
│
└── dist/                       # Compiled JavaScript output
```

### Source File Roles

| File | Lines | Responsibility |
|------|-------|----------------|
| `index.ts` | ~140 | Plugin entry: service lifecycle, context engine registration, tool registration |
| `context-engine.ts` | ~420 | Core lifecycle: `ingest`, `assemble` (auto-recall), `afterTurn` (batch write + commit eval), `compact` |
| `client.ts` | ~200 | HTTP client: search, recall, ls, tiered access, message writing, session close |
| `config.ts` | ~150 | Defaults, platform paths, TOML template, parsing, validation, plugin config sync |
| `binaries.ts` | ~200 | Platform detection, binary resolution, Qdrant/service start/stop, health checks, CLI execution |
| `tools.ts` | ~300 | Tool schemas and execute handlers for 9 tools |

---

## Technical Design

For a comprehensive technical design including OpenClaw Context Engine mechanism research, OpenViking reference implementation analysis, detailed lifecycle flow diagrams, API specifications, data structure definitions, and the implementation plan, see [TECH_DESIGN.md](TECH_DESIGN.md).

For a concise agent-facing reference covering architecture, design decisions, configuration, and constraints, see [.ai-context/CONTEXT_ENGINE.md](.ai-context/CONTEXT_ENGINE.md).

---

## License

[MIT](LICENSE)

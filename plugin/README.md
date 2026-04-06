# @memclaw/memclaw — Memory Plugin

[![npm version](https://img.shields.io/npm/v/@memclaw/memclaw.svg)](https://www.npmjs.com/package/@memclaw/memclaw)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![OpenClaw Compatible](https://img.shields.io/badge/OpenClaw-compatible-brightgreen)](https://github.com/openclaw/openclaw)

Layered semantic memory plugin for OpenClaw. Provides L0/L1/L2 tiered retrieval, automatic service management (Qdrant + cortex-mem-service), and one-click migration from OpenClaw native memory.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
  - [Memory Layers](#memory-layers)
  - [System Components](#system-components)
- [Installation](#installation)
  - [Requirements](#requirements)
  - [From npm](#from-npm)
  - [Local Development](#local-development)
- [Configuration](#configuration)
  - [Plugin Configuration](#plugin-configuration)
  - [Configuration Options](#configuration-options)
  - [Via UI](#via-ui)
- [Available Tools](#available-tools)
  - [cortex_search](#cortex_search)
  - [cortex_recall](#cortex_recall)
  - [cortex_add_memory](#cortex_add_memory)
  - [cortex_commit_session](#cortex_commit_session)
  - [cortex_ls](#cortex_ls)
  - [cortex_get_abstract](#cortex_get_abstract)
  - [cortex_get_overview](#cortex_get_overview)
  - [cortex_get_content](#cortex_get_content)
  - [cortex_explore](#cortex_explore)
  - [cortex_migrate](#cortex_migrate)
  - [cortex_maintenance](#cortex_maintenance)
- [Tool Selection Guide](#tool-selection-guide)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [CLI Reference](#cli-reference)
- [Security](#security)
- [Project Structure](#project-structure)
- [License](#license)

---

## Overview

MemClaw is an OpenClaw **Memory Plugin** (`kind: "memory"`) that brings Cortex Memory's production-grade three-layer memory architecture to your AI agents. Unlike OpenClaw's built-in memory, MemClaw uses L0/L1/L2 tiered retrieval to balance speed and context — achieving **68.42% accuracy** on LoCoMo10 vs. 35.65% for native memory, while using **~82% fewer tokens** per query.

The plugin is **tool-driven**: the AI agent explicitly calls tools like `cortex_search`, `cortex_add_memory`, and `cortex_commit_session` to manage memories. This gives you full control over when and how memories are stored and retrieved.

---

## Features

- **Three-Layer Memory Architecture** — L0 (abstract ~100 tokens), L1 (overview ~2000 tokens), L2 (full content) for intelligent tiered retrieval
- **Automatic Service Management** — Auto-starts Qdrant vector database and cortex-mem-service on plugin load
- **Semantic Search** — Vector-based similarity search across all memory layers with weighted scoring (L0 20% + L1 30% + L2 50%)
- **Virtual Filesystem Browsing** — Browse memory space via `cortex://` URIs with `cortex_ls`
- **Tiered Access** — Fine-grained control over which layers to read per request
- **Smart Exploration** — Guided discovery combining search and browsing
- **Migration Support** — One-click migration from OpenClaw native memory files
- **AGENTS.md Auto-Enhancement** — Automatically injects MemClaw usage guidelines into your workspace's AGENTS.md
- **Periodic Maintenance** — Auto-scheduled maintenance (prune, reindex, ensure-all layers) every 3 hours
- **Cross-Platform** — Windows x64, macOS Apple Silicon, Linux x64
- **Zero External Dependencies** — Qdrant and cortex-mem-service are pre-compiled and bundled; no manual installation needed

---

## Architecture

### Memory Layers

| Layer | File Suffix | Size | Content | Weight | Role |
|-------|-------------|------|---------|--------|------|
| **L0 (Abstract)** | `.abstract.md` | ~100 tokens | High-level one-line summary | 20% | Quick relevance filtering |
| **L1 (Overview)** | `.overview.md` | ~500-2000 tokens | Structured summary: key points, entities, decisions | 30% | Context refinement |
| **L2 (Full)** | `.md` | Original size | Complete original content | 50% | Precise matching |

**Progressive disclosure**: search queries all three layers via Qdrant, score with weighted ranking, then return results from the requested layers. This dramatically reduces token consumption compared to loading full conversation history.

### System Components

```
OpenClaw + MemClaw Plugin
         │
         ├── cortex_search         → Layered semantic search
         ├── cortex_recall         → Quick recall (L0 + L2)
         ├── cortex_add_memory     → Store a message
         ├── cortex_commit_session → Commit & extract memories
         ├── cortex_ls             → Browse memory filesystem
         ├── cortex_get_abstract   → L0 quick preview
         ├── cortex_get_overview   → L1 moderate detail
         ├── cortex_get_content    → L2 full content
         ├── cortex_explore        → Smart exploration
         ├── cortex_migrate        → Migrate from native memory
         └── cortex_maintenance    → Periodic maintenance
                    │
                    ▼
         cortex-mem-service (HTTP REST API, port 8085)
                    │
                    ▼
         Qdrant (vector database, ports 6333/6334)
                    │
                    ▼
         Local filesystem (Markdown files)
```

---

## Installation

### Requirements

| Requirement | Details |
|-------------|---------|
| **Platforms** | Windows x64, macOS Apple Silicon, Linux x64 |
| **Node.js** | ≥ 20.0.0 |
| **OpenClaw** | ≥ 2026.3.8 (installed and configured) |
| **LLM API** | OpenAI-compatible API key (for memory extraction & summarization) |
| **Embedding API** | OpenAI-compatible Embedding API key (for vector search) |

### From npm

```bash
openclaw plugins install @memclaw/memclaw
```

Then enable in your `openclaw.json`:

```jsonc
{
  "plugins": {
    "entries": {
      "memclaw": {
        "enabled": true,
        "config": {
          "tenantId": "tenant_claw",
          "autoStartServices": true,
          "llmApiKey": "your-llm-api-key",
          "llmModel": "gpt-5-mini",
          "embeddingApiKey": "your-embedding-api-key",
          "embeddingModel": "text-embedding-3-small"
        }
      }
    }
  },
  "agents": {
    "defaults": {
      "memorySearch": { "enabled": false }
    }
  }
}
```

> **Important**: Set `memorySearch.enabled: false` to disable OpenClaw's built-in memory search and use MemClaw instead.

### Local Development

```bash
git clone https://github.com/sopaco/memclaw.git
cd memclaw/plugin

# Install dependencies
bun install

# Build
bun run build
```

**Option A: Use `plugins.load.paths`**

```jsonc
{
  "plugins": {
    "load": {
      "paths": ["/path/to/memclaw/plugin"]
    },
    "entries": {
      "memclaw": { "enabled": true }
    }
  }
}
```

**Option B: Symlink to extensions directory**

```bash
mkdir -p ~/.openclaw/extensions
ln -sf "$(pwd)" ~/.openclaw/extensions/memclaw
```

Then enable in `openclaw.json` as shown above. After code changes, rebuild with `bun run build` and restart OpenClaw.

---

## Configuration

### Plugin Configuration

MemClaw is configured directly through OpenClaw's plugin settings in `openclaw.json`. On first run, a `config.toml` file is also created at a platform-specific location:

| Platform | Config Path |
|----------|------------|
| macOS | `~/Library/Application Support/memclaw/config.toml` |
| Windows | `%LOCALAPPDATA%\memclaw\config.toml` |
| Linux | `~/.local/share/memclaw/config.toml` |

The plugin settings in `openclaw.json` take precedence over the TOML file. LLM and Embedding API keys from `openclaw.json` are automatically synced to the TOML file.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceUrl` | string | `http://localhost:8085` | Cortex Memory service URL |
| `tenantId` | string | `tenant_claw` | Tenant ID for multi-user data isolation |
| `autoStartServices` | boolean | `true` | Auto-start Qdrant and cortex-mem-service |
| `defaultSessionId` | string | `default` | Default session ID for memory operations |
| `searchLimit` | number | `10` | Default number of search results |
| `minScore` | number | `0.6` | Minimum relevance score (0-1) |
| `qdrantPort` | number | `6334` | Qdrant gRPC port |
| `servicePort` | number | `8085` | cortex-mem-service port |
| `llmApiBaseUrl` | string | `https://api.openai.com/v1` | LLM API endpoint |
| `llmApiKey` | string | — | LLM API key (**required**) |
| `llmModel` | string | `gpt-5-mini` | LLM model name |
| `embeddingApiBaseUrl` | string | `https://api.openai.com/v1` | Embedding API endpoint |
| `embeddingApiKey` | string | — | Embedding API key (**required**) |
| `embeddingModel` | string | `text-embedding-3-small` | Embedding model name |
| `enhanceClawAgent` | boolean | `true` | Auto-inject MemClaw guidelines into AGENTS.md |

### Via UI

1. Open OpenClaw Settings (`openclaw.json` or via UI)
2. Navigate to **Plugins → MemClaw → Configuration**
3. Fill in the required LLM and Embedding fields
4. Save and **restart OpenClaw Gateway**

---

## Available Tools

### cortex_search

Layered semantic search across all memories with fine-grained control over returned content layers.

```jsonc
{
  "query": "database architecture decisions",
  "scope": "cortex://user/default",    // optional — omit to search ALL memories
  "limit": 5,
  "min_score": 0.6,
  "return_layers": ["L0"]              // ["L0"] | ["L0","L1"] | ["L0","L1","L2"]
}
```

**`return_layers` guide:**

| Layers | Tokens | When to Use |
|--------|--------|-------------|
| `["L0"]` | ~100 per result | Quick scanning, finding candidates |
| `["L0", "L1"]` | ~2100 per result | Need context and key points |
| `["L0", "L1", "L2"]` | Full | Need exact details or quotes |

### cortex_recall

Convenience wrapper for `cortex_search` with `return_layers=["L0", "L2"]` — returns both the snippet and full content.

```jsonc
{
  "query": "user preferences for code style",
  "scope": "cortex://user/default",  // optional
  "limit": 10
}
```

### cortex_add_memory

Store a message for future retrieval with optional metadata.

```jsonc
{
  "content": "User prefers TypeScript with strict mode and 2-space indentation",
  "role": "user",                     // "user" | "assistant" | "system"
  "session_id": "default",            // optional
  "metadata": {                       // optional
    "tags": ["preference", "typescript"],
    "importance": "high"
  }
}
```

### cortex_commit_session

Commit accumulated conversation content and trigger the complete memory extraction pipeline. **Call proactively at natural checkpoints**, not just at conversation end.

```jsonc
{
  "session_id": "default"
}
```

> **When to call**: After completing a task, topic transitions, after the user shares important preferences, or every 10-20 exchanges. Takes 30-60 seconds, runs asynchronously.

### cortex_ls

List directory contents to browse the memory space like a virtual filesystem.

```jsonc
{
  "uri": "cortex://session",          // default
  "recursive": false,
  "include_abstracts": false
}
```

**Common URIs:**

| URI | Description |
|-----|-------------|
| `cortex://session` | List all sessions |
| `cortex://session/{id}` | Browse a specific session |
| `cortex://session/{id}/timeline` | Timeline messages |
| `cortex://user/{id}/preferences` | User preferences |
| `cortex://user/{id}/entities` | User entities (people, projects) |
| `cortex://agent/{id}/cases` | Agent cases |

### cortex_get_abstract

Get L0 abstract layer (~100 tokens) for quick relevance checking.

```jsonc
{
  "uri": "cortex://session/abc123/timeline/2024-01-15_001.md"
}
```

### cortex_get_overview

Get L1 overview layer (~2000 tokens) with core information and context.

```jsonc
{
  "uri": "cortex://session/abc123/timeline/2024-01-15_001.md"
}
```

### cortex_get_content

Get L2 full content layer — the complete original content.

```jsonc
{
  "uri": "cortex://session/abc123/timeline/2024-01-15_001.md"
}
```

### cortex_explore

Smart exploration combining search and browsing for guided discovery within a scope.

```jsonc
{
  "query": "authentication flow",
  "start_uri": "cortex://session",
  "return_layers": ["L0"]
}
```

### cortex_migrate

Migrate from OpenClaw native memory to MemClaw. Run once during initial setup. Migrates:
- `memory/*.md` daily logs → session timeline files
- `MEMORY.md` → user preferences
- Generates L0/L1 layers and vector index

### cortex_maintenance

Perform periodic maintenance: vector prune, reindex, and ensure-all layers.

```jsonc
{
  "dryRun": false,
  "commands": ["prune", "reindex", "ensure-all"]
}
```

Runs automatically every 3 hours via a scheduled timer.

---

## Tool Selection Guide

```
┌─────────────────────────────────────────────────────────────────┐
│                    How to Access Memories                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Do you know WHERE the information is?                          │
│       │                                                          │
│       ├── YES ──► Use Direct Tiered Access                       │
│       │           cortex_ls → cortex_get_abstract/overview/content│
│       │                                                          │
│       └── NO ──► Do you know WHAT you're looking for?            │
│                    │                                             │
│                    ├── YES ──► Use Semantic Search               │
│                    │            cortex_search                     │
│                    │                                             │
│                    └── NO ──► Use Exploration                    │
│                                 cortex_explore                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Scenario | Tool |
|----------|------|
| Find information across all sessions | `cortex_search` |
| Quick recall with snippet + content | `cortex_recall` |
| Browse memory structure | `cortex_ls` |
| Quick relevance check for a URI | `cortex_get_abstract` |
| Get more details on a relevant URI | `cortex_get_overview` |
| Need exact full content | `cortex_get_content` |
| Explore with purpose | `cortex_explore` |
| Save important information | `cortex_add_memory` |
| Complete a task or topic | `cortex_commit_session` |
| First-time setup with existing memories | `cortex_migrate` |
| Data maintenance (auto-scheduled) | `cortex_maintenance` |

---

## Best Practices

### Token Optimization

- **Start with L0**: Use `return_layers: ["L0"]` for initial searches to minimize token usage
- **Escalate as needed**: Only add L1 or L2 when L0 results are relevant but insufficient
- **Scope wisely**: Omit `scope` to search all memories, or narrow to `cortex://user/default` for preferences only

### Session Management

- **Commit periodically**: Call `cortex_commit_session` at natural checkpoints, not just at the end
- **Good rhythm**: Once per significant topic completion (every 10-20 exchanges)
- **Avoid over-committing**: Don't call after every single message

### Search Strategy

- **Use natural language**: The semantic search understands context, not just keywords
- **Iterate**: If results are poor, rephrase the query or try `cortex_explore`
- **Browse when stuck**: `cortex_ls` can reveal memory organization patterns

### Metadata Recommendations

When using `cortex_add_memory`, consider adding:
- `tags`: Array of topic labels (e.g., `["typescript", "debugging"]`)
- `importance`: `"high"`, `"medium"`, or `"low"`
- `category`: `"preference"`, `"decision"`, `"fact"`, `"entity"`

---

## Troubleshooting

### Plugin Not Working

1. Run `openclaw skills` to check plugin load status
2. Verify `"enabled": true` in `openclaw.json`
3. Check OpenClaw logs for `[memclaw]` errors

### Services Won't Start

1. Check that ports **6333** (Qdrant HTTP), **6334** (Qdrant gRPC), and **8085** (cortex-mem-service) are available
2. Verify LLM and Embedding API keys are configured
3. Set `autoStartServices: false` to disable auto-start and manage services manually

### Memory Extraction Fails

1. Ensure `cortex_commit_session` was called after the conversation
2. Check that LLM API key is valid and has sufficient rate limits
3. Processing takes 30-60 seconds — be patient

### Migration Fails

1. Ensure OpenClaw workspace exists at `~/.openclaw/workspace`
2. Verify memory files exist in `~/.openclaw/workspace/memory/`
3. Migration is idempotent — safe to re-run

### Search Results Seem Stale

1. Run `cortex_maintenance` manually to rebuild indexes
2. Check that cortex-mem-service is healthy: `curl http://localhost:8085/health`

---

## CLI Reference

For advanced users, the cortex-mem-cli is available directly:

```bash
# List sessions
cortex-mem-cli --config config.toml --tenant tenant_claw session list

# Generate missing layers
cortex-mem-cli --config config.toml --tenant tenant_claw layers ensure-all

# Rebuild vector index
cortex-mem-cli --config config.toml --tenant tenant_claw vector reindex

# Vector pruning
cortex-mem-cli --config config.toml --tenant tenant_claw vector prune
```

The CLI binary is automatically resolved from the platform-specific npm package (`@memclaw/bin-darwin-arm64`, `@memclaw/bin-linux-x64`, or `@memclaw/bin-win-x64`).

---

## Security

- **All data stored locally** — no external transmission
- **API keys** handled through OpenClaw's sensitive field system (masked in UI)
- **Network binding** — Qdrant and cortex-mem-service bind to `localhost` only
- **Ports used**: 6333 (Qdrant HTTP), 6334 (Qdrant gRPC), 8085 (cortex-mem-service)

See [SECURITY.md](SECURITY.md) for details.

---

## Project Structure

```
plugin/
├── index.ts                    # Plugin entry point (exports default + named plugin object)
├── plugin-impl.ts              # Core implementation: service lifecycle, 11 tools, config sync
├── package.json                # NPM package manifest (@memclaw/memclaw v0.9.36)
├── openclaw.plugin.json        # OpenClaw plugin manifest (id, kind, configSchema, uiHints)
├── tsconfig.json               # TypeScript config (ES2022, NodeNext, strict)
├── SECURITY.md                 # Security documentation
├── README.md                   # This file
├── README_zh.md                # Chinese documentation
│
├── src/
│   ├── client.ts               # HTTP client for cortex-mem-service REST API
│   ├── config.ts               # Config management: TOML parsing, plugin sync, validation
│   ├── binaries.ts             # Binary resolution & service management (Qdrant + service)
│   ├── migrate.ts              # OpenClaw native memory migration
│   └── agents-md-injector.ts   # AGENTS.md auto-enhancement with legacy pattern detection
│
├── skills/
│   ├── memclaw/
│   │   ├── SKILL.md            # Agent skill: daily memory operations
│   │   └── references/
│   │       ├── tools.md        # Complete tool parameter reference
│   │       ├── best-practices.md # Token optimization, tool selection, session management
│   │       ├── memory-structure.md # URI structure, three-layer architecture
│   │       └── security.md     # Security best practices
│   │
│   └── memclaw-maintance/
│       ├── SKILL.md            # Agent skill: installation & maintenance
│       └── references/
│           ├── tools.md        # Migration & maintenance tool reference
│           └── troubleshooting.md # Comprehensive troubleshooting guide
│
└── dist/                       # Compiled JavaScript output
```

---

## License

[MIT](LICENSE)

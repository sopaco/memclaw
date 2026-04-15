---
name: memclaw-context-engine
description: MemClaw Context Engine — automatic long-term memory for OpenClaw. Once installed, automatically remembers important facts from conversations and recalls relevant context before responding. No manual tool calls needed for daily use.
---

# MemClaw Context Engine

> **Automatic Memory**: MemClaw Context Engine is a native context management plugin for OpenClaw. It automatically captures conversation memories and recalls relevant context — no manual tool calls required. Compared to built-in memory, it provides L0/L1/L2 tiered retrieval with up to 95% token savings.

> MemClaw is an open-source memory enhancement suite based on Cortex Memory. Both MemClaw and this Skill are open-sourced on [GitHub](https://github.com/sopaco/cortex-mem).

## How It Works

- **Auto-Capture**: At `afterTurn` (end of each conversation turn), automatically extracts and batches user/assistant messages to Cortex Memory. Sessions auto-commit when token count (50k), message count (20), or time interval (30min) thresholds are met.
- **Auto-Recall**: At `assemble` (before each model run), automatically searches for relevant memories using recent user messages and injects them as simulated `cortex_search` tool results. Includes 60s cooldown and 70% query overlap deduplication.

## Prerequisites

1. Install via `openclaw plugins install @memclaw/memclaw-context-engine` if not present
2. Configure `plugins.slots.contextEngine: "memclaw-context-engine"` in `openclaw.json` to activate
3. Fill in LLM/Embedding API keys in config (auto-opened on first run, or set in `openclaw.json`)
4. Set `agents.defaults.memorySearch.enabled: false` in `openclaw.json` to avoid conflicts with built-in memory
5. All configuration is managed through OpenClaw plugin settings. If the plugin or tools cannot be used, proactively inform the user and assist in completing the necessary configurations. See 'Troubleshooting' below.

## Available Tools

While the Context Engine handles memory automatically, these tools are available for explicit agent use:

### cortex_search — Search Memories

Layered semantic search across ALL memories with L0/L1/L2 control.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Search query (natural language) |
| `scope` | No | Search scope URI (omit to search ALL) |
| `limit` | No | Max results (default: 10) |
| `min_score` | No | Min relevance 0-1 (default: 0.65) |
| `return_layers` | No | `["L0"]`, `["L0","L1"]`, or `["L0","L1","L2"]` |

Example: User asks "What database did I prefer?"
```
cortex_search(query="database preference", return_layers=["L0"])
```

### cortex_recall — Quick Recall

Returns L0 snippet + L2 full content. Equivalent to `cortex_search(return_layers=["L0","L2"])`.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | Search query |
| `scope` | No | Search scope URI |
| `limit` | No | Max results (default: 10) |

### cortex_add_memory — Manual Store

Explicitly store a message with optional metadata.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `content` | Yes | Content to store |
| `role` | No | "user", "assistant", "system" (default: user) |
| `session_id` | No | Session ID (uses default if not specified) |
| `metadata` | No | Optional tags, importance, etc. |

Example: User says "Remember my email is xxx@example.com"
```
cortex_add_memory(content="User email: xxx@example.com", role="user", metadata={"tags": ["contact"], "importance": "high"})
```

### cortex_commit_session — Manual Commit

Close session and trigger memory extraction pipeline.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `session_id` | No | Session ID to close |

### cortex_forget — Delete Memories

Delete a memory by exact URI.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `uri` | Yes | Exact memory URI to delete |

Example: User says "Forget my phone number"
```
cortex_forget(uri="cortex://user/default/preferences/phone-number.md")
```

### cortex_maintenance — Periodic Maintenance

Perform maintenance on MemClaw data. **Runs automatically every 3 hours** but can be called manually.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `dryRun` | No | Preview changes without executing (default: false) |
| `commands` | No | Commands to run: `["prune", "reindex", "ensure-all"]` (default: all) |

**What it does:**
1. `prune` — Remove vectors whose source files no longer exist
2. `reindex` — Rebuild vector index and remove stale entries
3. `ensure-all` — Generate missing L0/L1 layer files

**When to call manually:**
- Search results seem incomplete or stale
- After recovering from a crash or data corruption
- When disk space cleanup is needed

```
cortex_maintenance()  # Run all commands
cortex_maintenance(dryRun=true)  # Preview only
cortex_maintenance(commands=["prune"])  # Run specific command
```

### Browse Tools

| Tool | Purpose |
|------|---------|
| `cortex_ls` | Browse memory virtual filesystem |
| `cortex_get_abstract` | Get L0 abstract (~100 tokens) |
| `cortex_get_overview` | Get L1 overview (~2000 tokens) |
| `cortex_get_content` | Get L2 full content |

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `tenantId` | `tenant_claw` | Tenant ID for data isolation |
| `autoStartServices` | `true` | Auto-start Qdrant + cortex-mem-service |
| `autoRecall` | `true` | Automatic memory recall during assembly |
| `autoCapture` | `true` | Automatic message capture after each turn |
| `recallWindow` | `5` | Recent user turns for recall query |
| `recallLimit` | `10` | Max memories recalled per assembly |
| `recallMinScore` | `0.65` | Min relevance score for recall |
| `commitTokenThreshold` | `50000` | Token threshold for auto-commit |
| `commitTurnThreshold` | `20` | Turn count threshold for auto-commit |
| `llmApiBaseUrl` | `https://api.openai.com/v1` | LLM API endpoint |
| `llmApiKey` | — | LLM API key (**required**) |
| `llmModel` | `gpt-5-mini` | LLM model name |
| `embeddingApiBaseUrl` | `https://api.openai.com/v1` | Embedding API endpoint |
| `embeddingApiKey` | — | Embedding API key (**required**) |
| `embeddingModel` | `text-embedding-3-small` | Embedding model name |

## Daily Operations

```bash
# Check plugin status
openclaw skills

# Check context engine slot
openclaw config get plugins.slots.contextEngine

# Disable memory (switch to legacy)
openclaw config set plugins.slots.contextEngine legacy

# Enable memory
openclaw config set plugins.slots.contextEngine memclaw-context-engine

# Restart gateway after changing slot
```

## Configuration Example

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

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Plugin not loaded | Slot not configured | Set `plugins.slots.contextEngine: "memclaw-context-engine"` |
| No memories recalled | No existing memory data | Use `cortex_add_memory` or wait for auto-capture + commit |
| Service errors | Qdrant/cortex-mem-service not running | Check ports 6333/6334/8085; verify `autoStartServices: true` |
| `extracted 0 memories` | Wrong LLM API key or model | Check `llmApiKey` and `llmModel` in config |
| Port occupied | Port used by another process | Change port: set `servicePort` / `qdrantPort` in config |
| Inaccurate recall | `recallMinScore` too low | Increase threshold or adjust `recallLimit` |

Config file location:
- macOS: `~/Library/Application Support/memclaw/config.toml`
- Linux: `~/.local/share/memclaw/config.toml`
- Windows: `%LOCALAPPDATA%\memclaw\config.toml`

No Docker required — all dependencies bundled with plugin.

## References

- [tools.md](./references/tools.md) — Detailed tool parameter reference
- [troubleshooting.md](./references/troubleshooting.md) — Comprehensive troubleshooting guide

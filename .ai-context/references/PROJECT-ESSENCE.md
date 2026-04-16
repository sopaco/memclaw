# Project Essence — MemClaw

> **Stability: HIGH** | Update: Quarterly or major version changes
>
> Last reviewed: 2026-04-16 (Audit completed)


---

## What Is This Project?

MemClaw is a **memory enhancement suite** for OpenClaw AI agents. It replaces OpenClaw's built-in memory with a production-grade three-layer semantic memory system, reducing token consumption by up to 95% while improving recall quality.

---

## Why Does It Exist?

**Problem:** OpenClaw's native memory is token-inefficient and lacks semantic search. Long conversations become expensive, and relevant context from past sessions is often lost.

**Solution:** MemClaw integrates [Cortex Memory](https://github.com/sopaco/cortex-mem) into OpenClaw, providing:
- **L0/L1/L2 tiered memory** — Abstract, overview, and full content layers
- **Semantic search** — Find relevant memories by meaning, not keyword
- **Automatic memory extraction** — Sessions are processed into structured memories
- **Zero-config setup** — Pre-compiled binaries, `npm install` is enough

---

## Who Is This For?

| User | Use Case |
|------|----------|
| OpenClaw users | Want better memory without managing infrastructure |
| AI agent developers | Need semantic memory for long-running sessions |
| Enterprise teams | Require tenant isolation and persistent memory |

---

## Core Value Proposition

```
Before MemClaw:
  User: "What did we decide about authentication?"
  Agent: [searches 50k tokens of conversation history]
  → Expensive, slow, incomplete

After MemClaw:
  User: "What did we decide about authentication?"
  Agent: [semantic search in L0 abstracts]
  → Cheap, fast, relevant
```

---

## What Does It Provide?

### Two OpenClaw Plugins

| Plugin | Kind | Interaction Model |
|--------|------|-------------------|
| `@memclaw/memclaw` | Memory Plugin | Agent explicitly calls tools (`cortex_search`, `cortex_add_memory`, etc.) |
| `@memclaw/context-engine` | Context Engine | Automatic lifecycle hooks (recall before response, capture after turn) |

**Key insight:** Both plugins share the same backend. Users can install one or both.

### Platform-Specific Binary Packages

Pre-compiled Qdrant + cortex-mem-service distributed via NPM:
- `@memclaw/bin-darwin-arm64` (macOS Apple Silicon)
- `@memclaw/bin-linux-x64` (Linux x64)
- `@memclaw/bin-win-x64` (Windows x64)

Users don't need to install Qdrant or Cortex Memory separately.

---

## Key Constraints

1. **Localhost only** — No external network exposure for security
2. **Tenant isolation** — `tenantId` separates data spaces
3. **Plugin config precedence** — `openclaw.json` > `config.toml` > defaults
4. **Markdown-based storage** — Memory files are plain Markdown with `cortex://` URIs
5. **OpenClaw ≥ 2026.3.8** — Required for plugin API compatibility

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Token reduction | ≥ 90% vs native memory |
| Recall relevance | ≥ 80% user satisfaction |
| Setup time | ≤ 5 minutes (npm install + config) |
| Zero-config rate | ≥ 70% users don't edit config.toml |

---

## Evolution Direction

- **Short-term:** Improve auto-commit triggers, add semantic query dedup
- **Mid-term:** Implement custom compaction, enhance migration tooling
- **Long-term:** Multi-modal memory (images, code artifacts), team memory sharing

---

*This file captures the stable essence of the project. For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).*
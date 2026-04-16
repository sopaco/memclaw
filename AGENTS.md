# AGENTS.md

> Project guide for coding agents. Keep this file focused on stable, high-level knowledge. Volatile details go in `.ai-context/`.

---

## Project Overview

**MemClaw** is a memory enhancement suite for [OpenClaw](https://github.com/openclaw/openclaw) AI agents, built on [Cortex Memory](https://github.com/sopaco/cortex-mem). It provides production-grade three-layer (L0/L1/L2) semantic memory that reduces token consumption by up to 95% compared to OpenClaw's built-in memory.

This is a **monorepo** with two installable OpenClaw plugins and pre-compiled binary packages:

| Subproject | Type | Purpose |
|------------|------|---------|
| `plugin/` | Memory Plugin (`kind: "memory"`) | Tool-driven memory management — agent explicitly calls tools |
| `context-engine/` | Context Engine (`kind: "context-engine"`) | Lifecycle-driven automatic recall & capture |
| `bin-darwin-arm64/` | Binary NPM package | Qdrant + cortex-mem-service for macOS Apple Silicon |
| `bin-linux-x64/` | Binary NPM package | Qdrant + cortex-mem-service for Linux x64 |
| `bin-win-x64/` | Binary NPM package | Qdrant + cortex-mem-service for Windows x64 |

All binaries (Qdrant, cortex-mem-service, cortex-mem-cli) are pre-compiled and distributed via platform-specific NPM packages (`@memclaw/bin-*`). Users do **not** need to install Cortex Memory or Qdrant separately.

---

## Quick Commands

### Plugin Development

```bash
cd plugin
bun install        # install deps (includes platform-specific binary packages)
bun run build      # TypeScript → dist/
```

### Context Engine Development

```bash
cd context-engine
bun install        # install deps
bun run build      # TypeScript → dist/
```

### Binary Packages

Binary packages are standalone NPM packages. No build step — they ship pre-compiled executables under `bin/`.

```bash
cd bin-darwin-arm64
npm pack           # create tarball for publishing
```

---

## Code Style & Conventions

- **Language**: TypeScript (strict mode), ES2022 target, `NodeNext` module resolution
- **Runtime**: Node.js ≥ 20.0.0
- **Package manager**: Bun (preferred), npm works too
- **No semicolons** — consistent with the existing codebase style
- **Error handling**: Log via `api.logger` or `this.logger`, never swallow errors silently. Return structured error objects with `error` key for tool failures.
- **Async patterns**: Use fire-and-forget (`promise.then().catch()`) for non-critical background operations (e.g., commit, session close). Wrap `finally` blocks in try/catch to prevent unhandled rejections.
- **Config precedence**: Plugin config in `openclaw.json` > `config.toml` on disk > hardcoded defaults

---

## Architecture at a Glance

```
OpenClaw Gateway
    │
    ├── Memory Plugin (plugin/)          ← Agent calls tools explicitly
    │       │
    │       └── CortexMemClient (HTTP)
    │
    ├── Context Engine (context-engine/) ← Automatic lifecycle hooks
    │       ├── ingest() → buffer locally
    │       ├── assemble() → auto-recall + inject
    │       ├── afterTurn() → batch write + commit eval
    │       └── compact() → flush + close session
    │
    └── cortex-mem-service (port 8085)
            │
            ├── Local filesystem (Markdown via cortex:// URIs)
            └── Qdrant (port 6333/6334, vector index)
```

Key design principle: **Both plugins share the same backend** (cortex-mem-service + Qdrant) and can be installed independently or together.

For detailed architecture, data flow, and design decisions, see [`.ai-context/references/ARCHITECTURE.md`](.ai-context/references/ARCHITECTURE.md).

---

## Working with Subprojects

### plugin/

A Memory Plugin that registers 12 tools (`cortex_search`, `cortex_recall`, `cortex_add_memory`, `cortex_commit_session`, etc.). Core logic lives in `plugin-impl.ts` (~1300 lines) with supporting modules in `src/`.

- **Skills**: Agent-facing instructions shipped in `skills/memclaw/` and `skills/memclaw-maintance/`
- **Migration**: `src/migrate.ts` handles one-click migration from OpenClaw native memory
- **AGENTS.md injector**: `src/agents-md-injector.ts` auto-enhances workspace AGENTS.md with MemClaw guidelines

### context-engine/

A Context Engine that implements OpenClaw's four lifecycle hooks (`ingest`, `assemble`, `afterTurn`, `compact`). Core logic in `context-engine.ts` (~420 lines).

- `ownsCompaction: false` — delegates compaction to OpenClaw runtime
- Auto-recall: 60s cooldown + 70% query overlap dedup
- Auto-commit: triggered by token count (50k), message count (20), or time interval (30min)

### bin-*/ (Binary Packages)

Each contains `bin/qdrant` and `bin/cortex-mem-service`. Platform detected at runtime via `process.platform` + `process.arch`. No TypeScript — pure distribution packages.

---

## .ai-context/ Directory

The `.ai-context/` folder contains supplementary documents that are **more likely to change** as the project evolves:

| File | Content |
|------|---------|
| [`references/ARCHITECTURE.md`](.ai-context/references/ARCHITECTURE.md) | Detailed component relationships, API dependencies, and design rationale |
| [`DYNAMICS.md`](.ai-context/DYNAMICS.md) | Current known issues, workarounds, and open TODOs |

### When to Update .ai-context/

Update files in `.ai-context/` when:

1. **Architecture changes** — New components removed, APIs added/removed, or data flow modified
2. **New known issues discovered** — During development or testing, if you find a bug or limitation that isn't obvious from the code
3. **API dependency changes** — New cortex-mem-service endpoints required, or existing ones deprecated
4. **Design decisions revisited** — Key tradeoffs re-evaluated (e.g., switching `ownsCompaction` from `false` to `true`)

**Do NOT update .ai-context/ for**:
- Minor refactors, variable renames, or code formatting
- Dependency version bumps (patch/minor)
- Documentation typos or wording improvements

Keep `.ai-context/` focused on information that would **meaningfully change how a coding agent understands or works with the project**.

---

## Safety Notes

- **Never hardcode API keys** — they come from OpenClaw plugin config, synced to `config.toml`
- **Localhost only** — Qdrant and cortex-mem-service bind to `localhost`. No external exposure
- **Sensitive fields** — LLM and Embedding API keys are marked `sensitive: true` in `openclaw.plugin.json`
- **Tenant isolation** — `tenantId` creates separate data spaces. Default is `tenant_claw`
- **Binary integrity** — Pre-compiled binaries are distributed via NPM. Users should verify source from `github.com/sopaco/cortex-mem`

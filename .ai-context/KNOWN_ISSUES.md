# Known Issues & TODOs

> Current limitations, workarounds, and open tasks. Updated as issues are discovered or resolved.

---

## Active Issues

### Binary duplication between subprojects

`plugin/src/binaries.ts` and `context-engine/binaries.ts` contain duplicated service management logic. Changes to one are not automatically reflected in the other.

**Workaround**: When modifying service startup/health logic, apply changes to both files.
**Ideal fix**: Extract shared binary management into a separate NPM package or symlink common source.

### Config sync gap

Plugin settings from `openclaw.json` are synced to `config.toml` only on plugin start. If `config.toml` is edited manually while OpenClaw is running, the plugin's in-memory state won't reflect those changes until restart.

**Workaround**: Restart OpenClaw after editing `config.toml` manually.

### No automated test suite

Neither `plugin/` nor `context-engine/` has a test framework configured. Changes are validated through manual OpenClaw integration testing.

**TODO**: Add Vitest or Jest with mocked HTTP client for unit tests.

### Service health checks are HTTP-only

Health checks use HTTP ping (`localhost:6333` for Qdrant, `localhost:8085/health` for cortex-mem-service). A service may pass the health check but still be in a degraded state (e.g., Qdrant collection corrupted).

**Workaround**: Manual verification via `curl http://localhost:8085/health` — check the `qdrant` and `llm` fields in response.

### In-memory state lost on restart

Session buffers and recall cooldown state are stored in-memory (JavaScript `Map`). If OpenClaw restarts mid-conversation, pending messages are lost and recall cooldown resets.

**Impact**: Minor — the next turn will re-capture messages. May cause a brief period of no recall after restart.
**Ideal fix**: Persist session buffer state to disk (low priority — current behavior is acceptable for most use cases).

---

## Design Decisions Under Review

### ownsCompaction: false

The Context Engine currently delegates compaction to OpenClaw's built-in algorithm. This means:
- Cortex Memory's archival/summarization is only triggered by `closeSession()`, not by context window pressure
- Long-running sessions may accumulate messages until `compact()` is called by OpenClaw, then `closeSession()` fires

**Under consideration**: Switching to `ownsCompaction: true` for tighter integration with Cortex Memory's archival pipeline. This would require implementing a custom compaction algorithm.

### Query deduplication (70% overlap)

The current query dedup uses simple word overlap comparison. It may miss semantic similarity (e.g., "how do I set up the database" vs "database configuration steps" have low word overlap but identical intent).

**Under consideration**: Add semantic similarity check using embeddings, or use a smarter N-gram overlap metric.

---

## Resolved

- ~~Config file not auto-created on first run~~ — Fixed: `ensureConfigExists()` in both plugins
- ~~Missing bulk message write~~ — Fixed: `client.addMessages()` with fallback to per-message writes
- ~~AGENTS.md not auto-enhanced~~ — Fixed: `agents-md-injector.ts` with idempotent injection

---

_Last updated: 2026-04-04_

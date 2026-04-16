# Dynamics — Active Issues & Constraints

> **Last updated:** 2026-04-16 (Audit completed)
> **Stability:** Dynamic — Update as issues arise/resolve

---

## ⚡ Quick Scan

| Status | Issue | Impact | Workaround |
|--------|-------|--------|------------|
| 🔴 Active | Binary duplication | Changes need sync | Apply to both files |
| 🔴 Active | No test suite | Manual validation | Test in OpenClaw |
| 🟡 Known | Config sync gap | Manual edits lost | Restart after edit |
| 🟡 Known | Health check limited | Degraded state hidden | Manual curl check |
| 🟡 Known | Documentation drift | Minor inaccuracies | This audit |
| 🟢 Resolved | ~~Config auto-create~~ | — | — |
| 🟢 Resolved | ~~Bulk message write~~ | — | — |

---

## 🔴 Active Issues

### Binary Service Management Duplication

**What:** `plugin/src/binaries.ts` and `context-engine/binaries.ts` contain duplicated logic for starting/stopping Qdrant and cortex-mem-service.

**Impact:** Changes to service startup or health checks must be applied to both files.

**Workaround:**
```
When modifying binaries.ts:
1. Apply changes to both plugin/ and context-engine/ versions
2. Keep logic identical unless intentionally diverging
```

**Resolution Path:** Extract into shared `@memclaw/bin-manager` package (not yet planned).

---

### No Automated Test Suite

**What:** Neither subproject has unit tests configured. Validation is manual through OpenClaw integration.

**Impact:**
- Refactoring confidence is low
- Regression risk when changing core logic
- No automated CI feedback

**Workaround:**
- Test significant changes through full OpenClaw integration
- Add logging to track execution flow
- Consider adding Vitest before major refactors

---

## 🟡 Known Constraints

### Config Sync Timing

Plugin settings sync from `openclaw.json` → `config.toml` only on plugin start. Manual `config.toml` edits during runtime are not reflected.

**Workaround:** Restart OpenClaw after editing `config.toml` directly.

---

### HTTP-Only Health Checks

Service health checks use HTTP endpoints. A service may pass but be degraded (e.g., corrupted Qdrant collection).

**Workaround:**
```bash
curl http://localhost:8085/health
# Verify 'qdrant' and 'llm' fields show 'healthy'
```

---

### In-Memory Session State

Session buffers and recall cooldown state are in-memory `Map` objects. Lost on OpenClaw restart.

**Impact:**
- Pending messages lost mid-conversation (recaptured next turn)
- Recall cooldown resets (may cause brief duplicate recall)

**Mitigation:** Acceptable for current use cases. Low priority to fix.

---

## 🟢 Recently Resolved

| Issue | Resolution | Date |
|-------|------------|------|
| Config file not auto-created | `ensureConfigExists()` in both plugins | 2026-03 |
| Missing bulk message write | Fallback to per-message writes | 2026-03 |
| AGENTS.md not auto-enhanced | Idempotent injector | 2026-03 |

---

## 📋 Under Consideration

### ownsCompaction: false

Currently delegates compaction to OpenClaw. Considering `ownsCompaction: true` for tighter Cortex Memory integration.

**Trigger for change:** If long-running sessions show context quality issues.

---

### Query Deduplication (70% Overlap)

Current dedup uses word overlap. May miss semantic duplicates like "database setup" vs "how to configure db".

**Trigger for change:** If users report redundant recall results.

---

## 🔄 Update Log

| Date | Change |
|------|--------|
| 2026-04-16 | Audit completed: confirmed binary duplication, added documentation drift issue |
| 2026-04-04 | Initial version, migrated from KNOWN_ISSUES.md |

---

*Remember: This file changes frequently. Always check the "Last updated" date. If it's been > 2 weeks, verify against current code state.*
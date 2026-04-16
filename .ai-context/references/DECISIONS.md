# Design Decisions — MemClaw

> Key architectural and design decisions that shape this project. Update when decisions are made or revisited.
>
> Last reviewed: 2026-04-16 (Audit completed)

---

## Decision Index

| ID | Decision | Status | Date |
|----|----------|--------|------|
| ADR-001 | Pre-compiled binary distribution | Active | 2024-01 |
| ADR-002 | Dual plugin strategy | Active | 2024-01 |
| ADR-003 | Dual configuration sources | Active | 2024-01 |
| ADR-004 | Delegated compaction | Active | 2024-01 |
| ADR-005 | In-memory session state | Active | 2024-01 |

---

## ADR-001: Pre-compiled Binary Distribution

**Context**: Users need Qdrant and cortex-mem-service to use MemClaw.

**Decision**: Distribute pre-compiled binaries via platform-specific NPM packages (`@memclaw/bin-*`).

**Rationale**:
- Zero external dependencies for end users
- No need to understand Qdrant setup or Cortex Memory configuration
- Version-locked binaries guarantee API compatibility

**Trade-offs**:
- (+) Simplest install experience: `npm install` is sufficient
- (+) Reproducible environments
- (-) Larger install size (~50-100MB per platform)
- (-) Binary updates require package version bump

**Implications**:
- Only one platform package is installed per user (detected at runtime)
- Binary package version must stay synchronized with plugin versions

---

## ADR-002: Dual Plugin Strategy

**Context**: OpenClaw supports two plugin kinds for memory: `memory` (tools) and `context-engine` (lifecycle hooks).

**Decision**: Maintain two separate plugins instead of one combined plugin.

**Rationale**:
- Different interaction models serve different use cases
- Users can choose: explicit tool calls vs. automatic lifecycle
- Both plugins share the same backend (cortex-mem-service + Qdrant)
- They can coexist if desired

**Trade-offs**:
- (+) User choice and flexibility
- (+) Clear separation of concerns
- (-) Duplicated code in `binaries.ts` and `client.ts`
- (-) Two packages to maintain

**Implications**:
- Code duplication should be monitored for drift
- Consider extracting shared code if duplication grows

---

## ADR-003: Dual Configuration Sources

**Context**: Configuration can come from OpenClaw's `openclaw.json` UI or a `config.toml` file on disk.

**Decision**: Accept both sources, with OpenClaw settings taking precedence. Sync plugin settings to TOML on startup.

**Rationale**:
- `config.toml` is required for CLI usage (cortex-mem-cli)
- `openclaw.json` provides user-friendly configuration UI
- Sync ensures CLI and plugin use consistent settings

**Trade-offs**:
- (+) Flexibility for both GUI and CLI users
- (+) Single source of truth after sync
- (-) Potential confusion about which config is authoritative
- (-) Manual TOML edits require restart to take effect

**Implications**:
- Document clearly that OpenClaw settings override TOML
- Manual TOML edits during runtime won't be reflected until restart

---

## ADR-004: Delegated Compaction (ownsCompaction: false)

**Context**: OpenClaw context engines can optionally handle their own context compaction.

**Decision**: Set `ownsCompaction: false` in the Context Engine, delegating to OpenClaw's built-in algorithm.

**Rationale**:
- Cortex Memory's archival is triggered by `closeSession()`, not in-band with context management
- Implementing custom compaction would duplicate OpenClaw's trimming logic
- Current approach is simpler and reliable

**Trade-offs**:
- (+) Less code to maintain
- (+) Consistent with OpenClaw's expected behavior
- (-) Less control over exact timing of archival
- (-) Long sessions accumulate until OpenClaw triggers compaction

**Revisit if**: Need tighter integration with Cortex Memory's archival pipeline.

---

## ADR-005: In-Memory Session State

**Context**: Session buffers and recall cooldown state need to be tracked during operation.

**Decision**: Store in JavaScript `Map` objects in memory. Accept loss on restart.

**Rationale**:
- Session state is transient by nature
- Lost messages on restart are acceptable — next turn re-captures
- Simplicity outweighs persistence benefits for current use cases

**Trade-offs**:
- (+) Simple implementation
- (+) No additional infrastructure
- (-) State lost on OpenClaw restart
- (-) Recall cooldown resets (may cause brief over-recall)

**Revisit if**: Persistence becomes critical (e.g., very long sessions, strict SLAs).

---

## Decision Template

When adding new decisions:

```markdown
## ADR-XXX: [Short Title]

**Context**: [What is the issue we're facing?]

**Decision**: [What did we decide to do?]

**Rationale**: [Why did we make this choice?]

**Trade-offs**:
- (+) [Benefit]
- (-) [Cost]

**Implications**: [What does this mean for the codebase/users?]

**Revisit if**: [Conditions that might warrant revisiting]
```

---

_This file captures decisions that aren't obvious from code. For implementation details, see ARCHITECTURE.md._
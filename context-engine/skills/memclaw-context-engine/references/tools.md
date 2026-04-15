# MemClaw Context Engine Tools Reference

Complete reference for all tools available in the Context Engine. These tools supplement the automatic recall/capture lifecycle hooks for explicit agent use.

## Search Tools

### cortex_search

Layered semantic search with L0/L1/L2 tiered retrieval.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| query | string | Yes | - | Search query (natural language or keywords) |
| scope | string | No | - | Search scope URI (omit to search ALL memories) |
| limit | integer | No | 10 | Maximum number of results |
| min_score | number | No | 0.65 | Minimum relevance score (0-1) |
| return_layers | ("L0" \| "L1" \| "L2")[] | No | ["L0"] | Which layers to return |

**Response:**
```json
{
  "content": "Found 3 results for \"database preference\":\n\n...",
  "results": [
    {
      "uri": "cortex://user/default/preferences/database-preference.md",
      "score": 0.87,
      "snippet": "User prefers PostgreSQL over MySQL...",
      "overview": "...",
      "content": "...",
      "layers": ["L0", "L1"]
    }
  ],
  "total": 3
}
```

**Example:**
```
# Quick scan with L0 only (token-efficient)
cortex_search(query="API design decisions", return_layers=["L0"])

# More context with L0+L1
cortex_search(query="authentication flow", return_layers=["L0", "L1"])

# Full detail retrieval
cortex_search(query="exact error message", return_layers=["L0", "L1", "L2"])

# Search within user preferences only
cortex_search(query="user preferences", scope="cortex://user/default")
```

---

### cortex_recall

Convenience wrapper returning L0 snippet + L2 full content.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| query | string | Yes | - | Search query |
| scope | string | No | - | Search scope URI |
| limit | integer | No | 10 | Maximum number of results |

**Response:** Same as `cortex_search` with `return_layers: ["L0", "L2"]`

---

## Storage Tools

### cortex_add_memory

Store a message in memory with optional metadata.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| content | string | Yes | - | Message content to store |
| role | string | No | "user" | Message role: "user", "assistant", "system" |
| session_id | string | No | default | Session/thread ID |
| metadata | object | No | - | Optional metadata (tags, importance, etc.) |

**Response:**
```json
{
  "content": "Memory stored successfully in session \"default\".\nResult: cortex://session/default/timeline/...",
  "success": true,
  "message_uri": "cortex://session/default/timeline/2024-01/15/10_30_00_abc123.md"
}
```

**Example:**
```
cortex_add_memory(
  content="User prefers TypeScript strict mode with 2-space indentation",
  role="assistant",
  metadata={"tags": ["preference", "typescript"], "importance": "high"}
)
```

---

### cortex_commit_session

Close session and trigger complete memory extraction pipeline.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| session_id | string | No | Session/thread ID to close (uses default if not specified) |

**Response:**
```json
{
  "content": "Session \"default\" closed successfully.\nStatus: closed, Memories extracted: 5",
  "success": true,
  "session": {
    "thread_id": "abc123",
    "status": "closed",
    "memories_extracted": {
      "preferences": 2,
      "entities": 1,
      "cases": 2
    }
  }
}
```

**When to call:**
- After completing a significant task or topic
- After user shares important preferences/decisions
- When conversation topic shifts significantly
- Before ending a conversation session

---

## Filesystem Tools

### cortex_ls

List directory contents to browse memory structure.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| uri | string | No | "cortex://session" | Directory URI to list |
| recursive | boolean | No | false | Recursively list subdirectories |
| include_abstracts | boolean | No | false | Include L0 abstracts for files |

**Response:**
```json
{
  "content": "Directory \"cortex://session\" (3 entries):\n\n...",
  "entries": [
    {
      "uri": "cortex://session/abc123",
      "name": "abc123",
      "is_directory": true,
      "size": 0,
      "abstract_text": "Discussion about API design..."
    }
  ],
  "total": 3
}
```

**Common URIs:**

| URI | Description |
|-----|-------------|
| `cortex://session` | List all sessions |
| `cortex://session/{id}` | Browse a specific session |
| `cortex://session/{id}/timeline` | Session message timeline |
| `cortex://user/{user_id}/preferences` | User preferences |
| `cortex://user/{user_id}/entities` | User entities (people, projects) |
| `cortex://agent/{agent_id}/cases` | Agent problem-solution cases |

---

## Tiered Access Tools

### cortex_get_abstract (L0)

Get ~100 token summary for quick relevance check.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| uri | string | Yes | Content URI (file or directory) |

**Response:**
```json
{
  "content": "L0 Abstract for \"cortex://session/abc123/timeline/...\" (~95 tokens):\n\n...",
  "uri": "cortex://session/abc123/timeline/...",
  "abstract": "Short abstract...",
  "token_count": 95,
  "layer": "L0"
}
```

---

### cortex_get_overview (L1)

Get ~2000 token overview with key information.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| uri | string | Yes | Content URI (file or directory) |

**Response:**
```json
{
  "content": "L1 Overview for \"cortex://session/abc123/timeline/...\" (~1850 tokens):\n\n...",
  "uri": "cortex://session/abc123/timeline/...",
  "overview": "Detailed overview...",
  "token_count": 1850,
  "layer": "L1"
}
```

---

### cortex_get_content (L2)

Get full original content.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| uri | string | Yes | Content URI (file only) |

**Response:**
```json
{
  "content": "L2 Full Content for \"cortex://session/abc123/timeline/...\" (~5420 tokens):\n\n...",
  "uri": "cortex://session/abc123/timeline/...",
  "full_content": "Full original content...",
  "token_count": 5420,
  "layer": "L2"
}
```

---

## Memory Management Tools

### cortex_forget

Delete a memory by exact URI.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| uri | string | Yes | Exact memory URI to delete |

**Response:**
```json
{
  "content": "Forgotten: cortex://user/default/preferences/phone-number.md",
  "success": true
}
```

**Example:**
```
cortex_forget(uri="cortex://user/default/preferences/phone-number.md")
```

---

## Maintenance Tools

### cortex_maintenance

Periodic data maintenance. **Auto-runs every 3 hours**.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| dryRun | boolean | No | false | Preview without executing |
| commands | string[] | No | ["prune", "reindex", "ensure-all"] | Commands to run |

**Commands:**
- `prune` — Remove orphaned vectors
- `reindex` — Rebuild vector index
- `ensure-all` — Generate missing L0/L1 layers

**Response:**
```json
{
  "content": "Maintenance completed:\nVector Prune: OK\nVector Reindex: OK\nLayers Ensure-All: OK\n\n3/3 commands succeeded.",
  "dryRun": false,
  "success": true
}
```

**When to call manually:**
- Search results stale/incomplete
- After crash recovery
- Disk cleanup needed

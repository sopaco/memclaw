# MemClaw Context Engine Troubleshooting

## Plugin Loading Issues

### Context Engine Not Activating

**Symptom:** Plugin loads but automatic recall/capture doesn't work.

**Causes:**
1. `plugins.slots.contextEngine` not set
2. Plugin `enabled: false`
3. OpenClaw version doesn't support context engines

**Fix:**
```bash
# Verify slot configuration
openclaw config get plugins.slots.contextEngine

# Set slot to activate context engine
openclaw config set plugins.slots.contextEngine memclaw-context-engine

# Verify plugin is enabled in openclaw.json
# "plugins": { "entries": { "memclaw-context-engine": { "enabled": true } } }

# Restart OpenClaw Gateway
```

### Plugin Not Found in Skills List

**Symptom:** `openclaw skills` doesn't show memclaw-context-engine.

**Fix:**
```bash
# Check if plugin is installed
npm ls @memclaw/memclaw-context-engine

# Reinstall if missing
openclaw plugins install @memclaw/memclaw-context-engine

# Check for loading errors in OpenClaw logs
```

## Service Issues

### Services Won't Start

**Symptom:** Qdrant or cortex-mem-service fails to start.

**Causes:**
1. Ports occupied (6333, 6334, 8085)
2. Missing binary packages
3. Permission issues

**Fix:**
```bash
# Check port usage
lsof -i :6333 -i :6334 -i :8085

# Check binary availability
# macOS: ls ~/.openclaw/extensions/memclaw-context-engine/node_modules/@memclaw/bin-darwin-arm64/bin/
# Linux: ls .../@memclaw/bin-linux-x64/bin/

# Disable auto-start and manage services manually
openclaw config set plugins.entries.memclaw-context-engine.config.autoStartServices false

# Verify service health
curl http://localhost:8085/health
```

### Port Occupied

**Symptom:** Error about port already in use.

**Fix:**
```bash
# Change ports in config
openclaw config set plugins.entries.memclaw-context-engine.config.servicePort 8086
openclaw config set plugins.entries.memclaw-context-engine.config.qdrantPort 6335

# Or kill the process using the port
lsof -ti :8085 | xargs kill
```

## Auto Recall Issues

### No Memories Returned During Recall

**Symptom:** Auto-recall returns empty results.

**Causes:**
1. No memory data exists yet
2. `autoRecall: false` in config
3. cortex-mem-service unreachable
4. Query doesn't match existing memories

**Fix:**
```bash
# Verify autoRecall is enabled
openclaw config get plugins.entries.memclaw-context-engine.config.autoRecall

# Check if memory data exists
cortex_ls(uri="cortex://session")

# Verify service is running
curl http://localhost:8085/health

# Manually store some memory first
cortex_add_memory(content="Test memory for verification", role="user")
cortex_commit_session()

# Wait for extraction to complete (30-60 seconds), then try again
```

### Inaccurate Recall Results

**Symptom:** Recall returns irrelevant memories.

**Fix:**
```bash
# Increase minimum score threshold
openclaw config set plugins.entries.memclaw-context-engine.config.recallMinScore 0.75

# Reduce recall limit for more focused results
openclaw config set plugins.entries.memclaw-context-engine.config.recallLimit 5

# Increase recall window for better query context
openclaw config set plugins.entries.memclaw-context-engine.config.recallWindow 8
```

## Auto Capture Issues

### Auto Commit Not Triggering

**Symptom:** Sessions are captured but never committed/extracted.

**Causes:**
1. Thresholds not met (tokens < 50000, messages < 20, interval < 30min)
2. `autoCapture: false`
3. cortex-mem-service unreachable during commit

**Fix:**
```bash
# Verify autoCapture is enabled
openclaw config get plugins.entries.memclaw-context-engine.config.autoCapture

# Lower thresholds for testing
openclaw config set plugins.entries.memclaw-context-engine.config.commitTokenThreshold 10000
openclaw config set plugins.entries.memclaw-context-engine.config.commitTurnThreshold 5

# Or manually commit
cortex_commit_session()
```

### Memory Extraction Returns 0 Memories

**Symptom:** `cortex_commit_session` reports `memories_extracted: 0`.

**Causes:**
1. Invalid LLM API key
2. Wrong LLM model name
3. LLM API rate limit exceeded
4. Session has no meaningful content

**Fix:**
```bash
# Verify LLM configuration
openclaw config get plugins.entries.memclaw-context-engine.config.llmApiKey
openclaw config get plugins.entries.memclaw-context-engine.config.llmModel

# Test LLM connectivity
curl -H "Authorization: Bearer YOUR_API_KEY" https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5-mini","messages":[{"role":"user","content":"Hello"}]}'

# Ensure session has sufficient content (not just short messages)
```

## Configuration Issues

### First-Run Config File Created But Empty

**Symptom:** Config file auto-created but plugin can't start.

**Fix:**
1. The config file is auto-opened in your default editor
2. Fill in `llm.api_key` and `embedding.api_key`
3. Save the file and restart OpenClaw
4. Alternatively, set these values directly in `openclaw.json`

**Config file locations:**
- macOS: `~/Library/Application Support/memclaw/config.toml`
- Linux: `~/.local/share/memclaw/config.toml`
- Windows: `%LOCALAPPDATA%\memclaw\config.toml`

### API Key Not Working

**Symptom:** LLM or Embedding API calls fail with authentication errors.

**Fix:**
```bash
# Verify keys are correctly set (no extra spaces or quotes)
openclaw config get plugins.entries.memclaw-context-engine.config.llmApiKey

# Test with a different API provider if available
openclaw config set plugins.entries.memclaw-context-engine.config.llmApiBaseUrl "https://your-custom-endpoint.com/v1"
```

## Performance Issues

### Slow Memory Operations

**Symptom:** Search or commit takes too long.

**Causes:**
1. Large memory corpus
2. Slow LLM API response
3. Network latency

**Fix:**
```bash
# Use scoped searches instead of global
cortex_search(query="...", scope="cortex://user/default")

# Use L0-only for initial searches
cortex_search(query="...", return_layers=["L0"])

# Run maintenance to optimize indexes
cortex_maintenance(commands=["reindex", "prune"])
```

### High Token Consumption

**Symptom:** Model context window fills up quickly.

**Fix:**
```bash
# The Context Engine uses L0-only for auto-recall by default (~100 tokens per memory)
# If you're using manual tools, stick to L0-first pattern:
cortex_search(query="...", return_layers=["L0"])

# Only escalate to L1/L2 when L0 results are relevant
cortex_get_overview(uri="...")  # ~2000 tokens
cortex_get_content(uri="...")   # Full content, use sparingly
```

## Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `cortex-mem-service is not running` | Service failed to start | Check ports, verify binaries, check logs |
| `Failed to start services` | Binary missing or port conflict | Install binary package, free up ports |
| `Need sessionId or sessionKey` | Missing session context | Ensure OpenClaw passes session info |
| `Batch write failed` | Service temporarily unreachable | Will retry on next turn automatically |
| `Auto-recall failed` | Network or service error | Check service health, verify config |

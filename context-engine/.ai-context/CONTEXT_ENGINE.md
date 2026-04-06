# @memclaw/context-engine — Agent Context

> 给 Coding Agent 的快速参考。描述架构、数据流、关键约束。不是给人类看的教程。

---

## 项目定位

OpenClaw 的 **Context Engine 插件**（非 Memory Plugin），将 Cortex Memory 集成为 OpenClaw 的原生上下文引擎。

**独立于 `@memclaw/plugin`**：两者并存，用户选装。本项目的核心差异化是**生命周期集成**（ingest/assemble/afterTurn/compact），而非被动工具调用。

---

## 架构

```
OpenClaw Context Engine Lifecycle
├── ingest()     → 本地缓冲消息（无网络）
├── assemble()   → 自动召回 + 注入上下文
├── afterTurn()  → 批量写入 + 评估触发 close
└── compact()    → 委托 OpenClaw 内置压缩，可选 close session

CortexMemClient (HTTP)
├── search()        → POST /api/v2/search
├── addMessages()   → POST /api/v2/sessions/{id}/messages/bulk (fallback: 逐条)
├── addMessage()    → POST /api/v2/sessions/{id}/messages
├── closeSession()  → POST /api/v2/sessions/{id}/close
├── ls/abstract/overview/content/get  → /api/v2/filesystem/*
└── switchTenant()  → POST /api/v2/tenants/switch
```

### 关键设计决策

| 决策 | 值 | 原因 |
|------|---|---|
| `ownsCompaction` | `false` | 委托 OpenClaw 内置压缩，避免重复实现归档逻辑 |
| 自动召回冷却 | 60s | 防止连续回合召回相同内容 |
| 召回 query 去重 | overlap ≥ 0.7 | 相似 query 跳过搜索 |
| 召回层级 | 仅 L0 | 节省 token（~100 tokens/结果） |
| 消息写入 | 批量优先 + 逐条 fallback | 减少 HTTP 调用 |
| commit 触发 | 本地状态追踪（非 API 查询） | 减少网络开销 |
| commit 最小间隔 | 30min | 防止频繁 LLM 提取 |

---

## 核心数据流

```
用户发消息
  │
  ▼
ingest() → buffer.pendingMessages.push(msg)
  │          buffer.pendingTokens += chars/4
  │
  ▼
assemble() → doAutoRecall(sessionId, messages)
  │            ├─ query 去重 + 冷却检查
  │            ├─ client.search() → L0 snippets
  │            └─ 注入为模拟 toolCall/toolResult
  │
  ▼
模型响应完成
  │
  ▼
afterTurn() → buffer.pendingMessages.splice(0)
  │             client.addMessages() → 批量写入
  │             shouldTriggerCommit() → 本地评估
  │             triggerCommitAsync() → fire-and-forget close
  │
  ▼
OpenClaw 触发 compact()（上下文满时）
  │
  ▼
compact() → 刷新 pending 消息 → closeSession() → 重置 buffer
```

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `index.ts` | 插件入口：服务启动、引擎注册、工具注册 |
| `context-engine.ts` | Context Engine 四个生命周期实现 |
| `client.ts` | Cortex Mem Service HTTP 客户端 |
| `tools.ts` | 10 个工具定义（search, add_memory, commit 等） |
| `config.ts` | 配置解析和默认值 |
| `binaries.ts` | Qdrant / cortex-mem-service 二进制管理 |

---

## 依赖的 Cortex Memory API

### 已有（v1/v2）

| API | 方法 | 用途 |
|-----|------|------|
| `/api/v2/search` | POST | 语义召回（L0/L1/L2） |
| `/api/v2/sessions` | POST | 创建 session |
| `/api/v2/sessions/{id}/messages` | POST | 单条消息写入 |
| `/api/v2/sessions/{id}/close` | POST | 关闭 session → 触发记忆提取 |
| `/api/v2/sessions/{id}/close-and-wait` | POST | 同步等待提取完成 |
| `/api/v2/filesystem/*` | GET | L0/L1/L2 读取 |
| `/api/v2/tenants/switch` | POST | 多租户切换 |

### 期望但当前可能缺失

| API | 方法 | 用途 | 状态 |
|-----|------|------|------|
| `/api/v2/sessions/{id}/messages/bulk` | POST | 批量写入 | client.ts 已实现 fallback |

**Fallback 策略**：bulk API 失败时逐条调用 `addMessage`，失败消息记录日志但不阻塞。

---

## 配置项

```typescript
interface ContextEngineConfig {
  serviceUrl: string;            // cortex-mem-service 地址 (default: http://localhost:8085)
  tenantId: string;              // 租户 ID (default: "tenant_claw")
  defaultSessionId: string;      // 默认 session (default: "default")
  autoStartServices: boolean;    // 自动启动 Qdrant + service (default: true)
  autoRecall: boolean;           // 启用自动召回 (default: true)
  recallWindow: number;          // 取最近 N 条 user 消息构造 query (default: 5)
  recallLimit: number;           // 召回数量上限 (default: 10)
  recallMinScore: number;        // 最低相关分 (default: 0.65)
  autoCapture: boolean;          // 启用自动捕获 (default: true)
  commitTokenThreshold: number;  // pending tokens 达到阈值触发 close (default: 50000)
  commitTurnThreshold: number;   // 消息数达到阈值触发 close (default: 20)
  commitIntervalMs: number;      // 两次 close 最小间隔 (default: 30min)
}
```

---

## 关键约束和边界情况

1. **多 session 隔离**：recall state 和 session buffer 按 `sessionId` 隔离，不共享
2. **进程内状态**：buffer 和 recall state 存在内存中，重启后丢失（设计如此）
3. **异步 commit 不阻塞**：`triggerCommitAsync` 是 fire-and-forget，finally 中有异常保护
4. **compact 委托**：`ownsCompaction: false`，OpenClaw 负责上下文截断，本引擎只负责 close session 触发记忆提取
5. **降级策略**：assemble 失败时返回原始 messages，不阻塞对话
6. **心跳过滤**：`isHeartbeat=true` 的消息不缓冲

---

## Token 消耗优化（已实施）

| 优化点 | 前 | 后 |
|--------|---|---|
| assemble 网络调用 | `getSessionContext`（不存在）+ search | 仅 search |
| 自动召回频率 | 每轮触发 | 60s 冷却 + query 去重 |
| 召回层级 | L0+L1 | 仅 L0（~100 tokens/结果） |
| afterTurn 写入 | N × addMessage | 1 × addMessages (bulk) |
| commit 评估 | `getSession` API 查询 | 本地计数器 |
| commit 频率 | 无间隔保护 | 30min 最小间隔 |

**预期平均每轮对话 token 消耗**：~300-500 tokens（优化前 ~3000-5000）

---

## 工具列表

| 工具 | 用途 |
|------|------|
| `cortex_search` | 显式语义检索 |
| `cortex_recall` | 召回（L0+L2） |
| `cortex_add_memory` | 强制写入记忆 |
| `cortex_commit_session` | 手动关闭 session |
| `cortex_ls` | 浏览记忆文件系统 |
| `cortex_get_abstract` | 获取 L0 摘要 |
| `cortex_get_overview` | 获取 L1 概览 |
| `cortex_get_content` | 获取 L2 全文 |
| `cortex_forget` | 删除记忆 |

**注意**：`cortex_archive_expand` 已移除（归档不是 Cortex Memory 的核心机制，记忆衰减通过 `archived` 标记处理）

---

## 开发注意事项

- **不要**重新引入 `smol-toml` 依赖（已从 config.ts 移除）
- **不要**实现自己的归档/压缩逻辑（`ownsCompaction: false`）
- **不要**依赖 `getSessionContext` 或 `getSessionArchive` API（不存在）
- **批量写入**优先使用 `addMessages()`，fallback 自动生效
- **session ID 映射**：OpenClaw UUID → Cortex session ID（Windows 路径安全），使用 `openClawSessionToCortexId()`

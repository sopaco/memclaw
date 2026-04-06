<p align="center">
    <img src="./assets/intro_banner_glance.webp">
</p>
<h1 align="center">Cowork Forge</h1>

<p align="center">
    <a href="./README.md">English</a>
    |
    <a href="./README_zh.md">中文</a>
</p>

<p align="center">
    <a href="https://github.com/openclaw/openclaw"><img alt="OpenClaw Compatible" src="https://img.shields.io/badge/OpenClaw-compatible-brightgreen"/></a>
    <a href="https://raw.githubusercontent.com/sopaco/cortex-mem/refs/heads/main/assets/benchmark/cortex_mem_vs_openclaw_3.png?raw=true"><img alt="Benchmark" src="https://img.shields.io/badge/Benchmark-Perfect-green?logo=speedtest&labelColor=%231150af&color=%2300b89f"></a>
    <a href="https://github.com/sopaco/cortex-mem/tree/main/litho.docs/en"><img alt="Litho Docs" src="https://img.shields.io/badge/Litho-Docs-green?logo=Gitbook&color=%23008a60"/></a>
    <a href="https://github.com/sopaco/cortex-mem/tree/main/litho.docs/zh"><img alt="Litho Docs" src="https://img.shields.io/badge/Litho-中文-green?logo=Gitbook&color=%23008a60"/></a>
</p>

> **MemClaw** — 为 OpenClaw 打造的 [Cortex Memory](https://github.com/sopaco/cortex-mem) 记忆增强套件，提供生产级 L0/L1/L2 分层语义记忆与原生 Context Engine 集成。

---

## 一句话介绍

MemClaw 将 [Cortex Memory](https://github.com/sopaco/cortex-mem) 的三级分层记忆架构无缝集成到 [OpenClaw](https://docs.openclaw.ai/zh-CN)，让 AI Agent 能像人一样**自动记住过去、主动召回相关记忆、按需浏览完整记忆空间**，同时相比 OpenClaw 内置记忆方案**最高节省 95% token 消耗**。

| 大幅**强化**OpenClaw记忆能力 | 至高节约**90%** Token |
| :--- | :--- |
| ![Layered Context Loading](./assets/intro_overview.webp) | ![architecture_style_modern](./assets/intro_benchmark.webp) |

---

## 目录

- [为什么需要 MemClaw](#为什么需要-memclaw)
- [项目结构](#项目结构)
- [核心特性](#核心特性)
- [架构总览](#架构总览)
- [三级记忆架构](#三级记忆架构)
- [快速开始](#快速开始)
  - [安装 Memory Plugin](#安装-memory-plugin)
  - [安装 Context Engine](#安装-context-engine)
- [配置指南](#配置指南)
- [可用工具一览](#可用工具一览)
- [Memory Plugin vs Context Engine — 我该选哪个](#memory-plugin-vs-context-engine--我该选哪个)
- [与其他项目的关系](#与其他项目的关系)
- [性能基准](#性能基准)
- [故障排查](#故障排查)
- [FAQ](#faq)
- [许可证](#许可证)

---

## 为什么需要 MemClaw

OpenClaw 是一个强大的 AI Agent 网关，但其内置的记忆方案存在以下局限：

| 问题 | OpenClaw 内置记忆 | MemClaw 方案 |
|------|------------------|-------------|
| Token 消耗 | 每次加载完整历史，约 15,982 tokens/题 | 分层加载，约 2,900 tokens/题 |
| 记忆准确率 | 35.65% (LoCoMo10) | **68.42%** |
| 多跳推理能力 | 弱 | **84.29%** (Cat 4) |
| 记忆组织 | 平面列表 | L0/L1/L2 三级结构化 |
| 上下文管理 | 内置固定策略 | 可插拔 Context Engine |

MemClaw 解决了这些问题——它让无状态的 Agent 变成**能记住用户偏好、能跨会话学习、能提供个性化交互**的智能助手。

---

## 项目结构

MemClaw 由两个独立可安装的 OpenClaw 插件组成，用户可根据需求选择其一或同时使用：

```
memclaw/
├── plugin/              # @memclaw/memclaw — Memory Plugin（被动记忆存储）
│   ├── dist/            #   构建产物
│   ├── skills/          #   Agent 技能文件（工具使用指南、最佳实践）
│   ├── src/             #   源码
│   ├── openclaw.plugin.json
│   └── README.md        #   Plugin 详细文档
│
├── context-engine/      # @memclaw/context-engine — Context Engine（主动上下文管理）
│   ├── dist/            #   构建产物
│   ├── index.ts         #   插件入口
│   ├── context-engine.ts #  Context Engine 生命周期实现
│   ├── client.ts        #   Cortex Memory 客户端
│   ├── tools.ts         #   工具定义
│   ├── config.ts        #   配置管理
│   ├── binaries.ts      #   二进制服务管理
│   └── TECH_DESIGN.md   #   技术设计文档
│
├── bin-darwin-arm64/    # macOS Apple Silicon 预编译二进制包
│   └── bin/
│       ├── qdrant              # Qdrant 向量数据库
│       └── cortex-mem-service  # Cortex Memory REST API 服务
│
├── bin-linux-x64/       # Linux x64 预编译二进制包（同上结构）
├── bin-win-x64/         # Windows x64 预编译二进制包（同上结构）
│
└── LICENSE
```

### 每个目录做什么？

| 目录 | NPM 包名 | 类型 | 定位 |
|------|----------|------|------|
| `plugin/` | `@memclaw/memclaw` | Memory Plugin (`kind: "memory"`) | 提供记忆工具，依赖 Agent 主动调用 |
| `context-engine/` | `@memclaw/context-engine` | Context Engine (`kind: "context-engine"`) | 自动管理上下文，生命周期钩子驱动 |
| `bin-*/` | `@memclaw/bin-*` | 预编译二进制分发 | Qdrant + cortex-mem-service 开箱即用 |

---

## 核心特性

### 两个插件共同提供

- **三级记忆架构** — L0 摘要(~100 tokens) / L1 概览(~2000 tokens) / L2 完整内容，渐进式披露
- **语义向量搜索** — 基于 Qdrant 的向量相似度检索，支持多层加权评分
- **自动服务管理** — 插件启动时自动拉起 Qdrant 和 cortex-mem-service，无需手动运维
- **一键迁移** — 从 OpenClaw 原生记忆无缝迁移到 MemClaw
- **跨平台** — Windows x64、macOS Apple Silicon、Linux x64 全覆盖
- **零外部依赖安装** — Qdrant 和 cortex-mem-service 已预编译打包，`npm install` 即可用

### Memory Plugin (`plugin/`) 独有

- **手动工具驱动** — Agent 通过调用 `cortex_search`、`cortex_add_memory`、`cortex_commit_session` 等工具操作记忆
- **精细层级控制** — 每次搜索可指定返回 L0/L1/L2 哪些层级
- **记忆文件系统浏览** — `cortex_ls` 浏览 `cortex://` URI 空间

### Context Engine (`context-engine/`) 独有

- **全自动上下文管理** — 无需 Agent 调用工具，每次模型运行前自动召回相关记忆
- **自动消息捕获** — 每轮对话自动写入记忆，达到阈值自动触发提交
- **智能压缩接管** — `ownsCompaction: true`，完全控制上下文压缩策略
- **归档展开** — `cortex_archive_expand` 工具从压缩摘要回溯原始对话
- **绕过模式** — 配置 `bypassSessionPatterns` 对特定会话禁用引擎

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  OpenClaw Gateway                                            │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │  Memory Plugin   │    │   Context Engine             │   │
│  │  (@memclaw/      │    │   (@memclaw/                 │   │
│  │   memclaw)       │    │    context-engine)           │   │
│  │                  │    │                              │   │
│  │  • cortex_search │    │   • ingest()  ← 消息接收     │   │
│  │  • cortex_recall │    │   • assemble() ← 上下文组装  │   │
│  │  • cortex_add_*  │    │   • afterTurn() ← 写入+提交  │   │
│  │  • cortex_commit │    │   • compact() ← 压缩+提取    │   │
│  │  • cortex_ls     │    │                              │   │
│  │  • cortex_migrate│   │   + 全套工具                  │   │
│  └───────┬──────────┘    └──────────┬─────────────────┘   │
│          │                          │                      │
│          └──────────┬───────────────┘                      │
│                     ▼                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │  cortex-mem-service (HTTP REST API, port 8085)     │    │
│  │                                                     │    │
│  │  POST /api/v2/sessions           创建会话           │    │
│  │  POST /.../sessions/{id}/messages 写入消息          │    │
│  │  POST /.../sessions/{id}/commit   提交+记忆提取     │    │
│  │  GET  /.../sessions/{id}/context  获取上下文        │    │
│  │  POST /api/v2/search              语义搜索          │    │
│  │  GET  /api/v2/filesystem/*        虚拟文件系统       │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                  │
│          ┌──────────────┴──────────────┐                   │
│          ▼                             ▼                   │
│  ┌───────────────┐          ┌────────────────────┐        │
│  │  本地文件系统  │          │  Qdrant 向量数据库  │        │
│  │               │          │  (port 6333/6334)   │        │
│  │  session/     │          │                     │        │
│  │  user/        │          │  向量索引 +          │        │
│  │  agent/       │          │  语义相似度检索       │        │
│  │  resources/   │          │                     │        │
│  └───────────────┘          └────────────────────┘        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 三级记忆架构

MemClaw 的核心创新是 L0/L1/L2 三级记忆体系，模仿人类记忆从"模糊印象"到"清晰回忆"的渐进过程：

| 层级 | 文件名 | 大小 | 内容 | 搜索权重 | 使用时机 |
|------|--------|------|------|---------|---------|
| **L0 摘要** | `*.abstract.md` | ~100 tokens | 一句话概括 | 20% | 快速判断是否相关 |
| **L1 概览** | `*.overview.md` | ~500-2000 tokens | 结构化摘要：关键点、实体、决策 | 30% | 获取更多上下文 |
| **L2 完整** | `*.md` | 原始大小 | 完整对话/内容 | 50% | 需要精确细节 |

**搜索流程**：查询向量化 → Qdrant 向量搜索 → 三层加权评分 → 返回最相关记忆

**Token 效率**：相比加载完整历史，三级架构最高节省 **95%** token 消耗。

---

## 快速开始

### 环境要求

| 要求 | 详情 |
|------|------|
| **平台** | Windows x64 / macOS Apple Silicon / Linux x64 |
| **Node.js** | ≥ 20.0.0 |
| **OpenClaw** | 已安装并配置（≥ 2026.3.8 推荐） |
| **LLM API** | OpenAI 兼容 API（用于记忆提取和摘要） |
| **Embedding API** | OpenAI 兼容 Embedding API（用于向量搜索） |

### 安装 Memory Plugin

适用于希望**手动控制记忆操作**的场景：

```bash
# 从 npm 安装
openclaw plugins install @memclaw/memclaw
```

然后在 `openclaw.json` 中配置：

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
    },
    "slots": {
      // 可选：如果想用 Context Engine 替代
      // "contextEngine": "memclaw-context-engine"
    }
  },
  "agents": {
    "defaults": {
      "memorySearch": { "enabled": false }  // 禁用 OpenClaw 内置记忆
    }
  }
}
```

重启 OpenClaw 即可使用。插件会自动启动 Qdrant 和 cortex-mem-service 服务。

### 安装 Context Engine

适用于希望**全自动上下文管理**的场景：

```bash
# 从 npm 安装（包名待发布）
openclaw plugins install @memclaw/context-engine
```

在 `openclaw.json` 中配置为 Context Engine：

```jsonc
{
  "plugins": {
    "entries": {
      "memclaw-context-engine": {
        "enabled": true,
        "config": {
          "tenantId": "tenant_claw",
          "autoStartServices": true,
          "llmApiKey": "your-llm-api-key",
          "embeddingApiKey": "your-embedding-api-key",
          "autoRecall": true,
          "autoCapture": true
        }
      }
    },
    "slots": {
      "contextEngine": "memclaw-context-engine"  // 激活为上下文引擎
    }
  }
}
```

首次启动时会自动创建配置文件，填写 API 密钥后重启 OpenClaw。

### 本地开发安装

```bash
git clone https://github.com/sopaco/memclaw.git
cd memclaw

# 安装 plugin
cd plugin && bun install && bun run build

# 或安装 context-engine
cd ../context-engine && bun install && bun run build
```

然后通过 `plugins.load.paths` 或符号链接方式加载。详见 [plugin/README.md](plugin/README.md)。

---

## 配置指南

### 通用配置项

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `serviceUrl` | string | `http://localhost:8085` | cortex-mem-service 地址 |
| `tenantId` | string | `tenant_claw` | 租户 ID，用于多用户数据隔离 |
| `autoStartServices` | boolean | `true` | 自动启动 Qdrant 和 cortex-mem-service |
| `llmApiBaseUrl` | string | `https://api.openai.com/v1` | LLM API 端点 |
| `llmApiKey` | string | - | LLM API 密钥（**必填**） |
| `llmModel` | string | `gpt-5-mini` | LLM 模型名 |
| `embeddingApiBaseUrl` | string | `https://api.openai.com/v1` | Embedding API 端点 |
| `embeddingApiKey` | string | - | Embedding API 密钥（**必填**） |
| `embeddingModel` | string | `text-embedding-3-small` | Embedding 模型名 |

### Context Engine 专属配置

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `autoRecall` | boolean | `true` | 每次模型调用前自动召回相关记忆 |
| `recallWindow` | number | `5` | 用最近 N 条 user 消息构造搜索 query |
| `recallLimit` | number | `10` | 召回结果数量 |
| `recallMinScore` | number | `0.65` | 召回分数阈值 |
| `autoCapture` | boolean | `true` | 自动捕获每轮对话到记忆 |
| `commitTokenThreshold` | number | `50000` | 触发自动提交的 token 阈值 |
| `commitTurnThreshold` | number | `20` | 触发自动提交的轮次阈值 |
| `bypassSessionPatterns` | string[] | `[]` | 绕过引擎的 session 正则模式 |

---

## 可用工具一览

### Memory Plugin & Context Engine 共有

| 工具 | 用途 | 典型场景 |
|------|------|---------|
| `cortex_search` | 分层语义搜索 | "查找之前关于数据库架构的讨论" |
| `cortex_recall` | 召回记忆（含完整上下文） | "我之前说过什么代码风格偏好" |
| `cortex_add_memory` | 主动存储记忆 | "请记住：我喜欢用 Tabs=2" |
| `cortex_commit_session` | 提交会话，触发记忆提取 | 完成任务后手动提交 |
| `cortex_ls` | 浏览记忆虚拟文件系统 | 探索记忆结构 |
| `cortex_get_abstract` | 获取 L0 摘要 (~100 tokens) | 快速预览判断相关性 |
| `cortex_get_overview` | 获取 L1 概览 (~2000 tokens) | 获取结构化摘要 |
| `cortex_get_content` | 获取 L2 完整内容 | 需要原始精确信息 |
| `cortex_explore` | 智能探索（搜索+浏览） | 有目的地发现相关记忆 |
| `cortex_migrate` | 从 OpenClaw 原生记忆迁移 | 首次安装时运行一次 |
| `cortex_maintenance` | 定期维护（清理/重建索引） | 每 3h 自动，也可手动 |

### Context Engine 专属

| 工具 | 用途 |
|------|------|
| `cortex_archive_expand` | 从压缩归档中恢复原始对话内容 |
| `cortex_forget` | 删除错误或过时的记忆 |

---

## Memory Plugin vs Context Engine — 我该选哪个

| 维度 | Memory Plugin | Context Engine |
|------|--------------|----------------|
| **类型** | `kind: "memory"` | `kind: "context-engine"` |
| **工作模式** | 被动 — Agent 需要主动调用工具 | 主动 — 生命周期钩子自动触发 |
| **记忆写入** | 手动调用 `cortex_add_memory` / `cortex_commit_session` | `afterTurn()` 自动捕获 |
| **记忆召回** | 手动调用 `cortex_search` / `cortex_recall` | `assemble()` 自动召回 |
| **上下文压缩** | OpenClaw 内置 | 完全接管 (`ownsCompaction: true`) |
| **适用人群** | 喜欢精细控制的用户 | 想要"开箱即用"自动记忆的用户 |
| **可否共存** | ✅ 可同时安装，工具互相补充 | ✅ 可同时安装 |

**推荐**：如果你不确定，**先装 Context Engine**——它自动化程度更高，体验更流畅。如果你希望对记忆操作有完全控制，选 Memory Plugin。

---

## 与其他项目的关系

```
┌──────────────────────────────────────────────────────────┐
│                     你在这里 (memclaw)                    │
│                                                          │
│  memclaw ──────────────────────────────────────────────► │
│  OpenClaw 的记忆增强插件                                  │
│                                                          │
│  底层依赖:                                                │
│  ├── Cortex Memory (cortex-mem)                          │
│  │   ├── cortex-mem-core    (核心记忆引擎)               │
│  │   ├── cortex-mem-service (REST API 服务)              │
│  │   └── cortex-mem-cli     (命令行工具)                 │
│  │                                                       │
│  ├── Qdrant (向量数据库)                                  │
│  │   └── 语义搜索的向量存储后端                           │
│  │                                                       │
│  └── OpenClaw (Agent 网关)                               │
│      ├── Context Engine 接口 (生命周期钩子)               │
│      └── Plugin 系统 (Memory + Context Engine slots)     │
│                                                          │
│  预编译二进制:                                            │
│  ├── bin-darwin-arm64/  → Qdrant + cortex-mem-service    │
│  ├── bin-linux-x64/     → Qdrant + cortex-mem-service    │
│  └── bin-win-x64/       → Qdrant + cortex-mem-service    │
│                                                          │
│  注：所有底层依赖已通过预编译二进制集成到 npm 包中，       │
│  用户无需单独安装 Qdrant 或 Cortex Memory。               │
└──────────────────────────────────────────────────────────┘
```

**关键说明**：

- MemClaw 起源于 [Cortex Memory](https://github.com/sopaco/cortex-mem) 项目中的 `examples/@memclaw/` 目录
- 因为它足够好用，被抽取到独立的 Git 仓库以方便独立发布和使用
- 底层依赖的 `cortex-mem-service`、`cortex-mem-cli` 和 `qdrant` 已经**预编译**并打包到 `bin-darwin-arm64/`、`bin-linux-x64/`、`bin-win-x64/` npm 包中
- **用户无需单独安装这些组件**——`npm install @memclaw/memclaw` 即包含全部所需二进制文件

---

## 性能基准

在 [LoCoMo10](https://github.com/sopaco/cortex-mem) 数据集上的评测：

| 系统 | 准确率 | 平均 Tokens/题 |
|------|:------:|:--------------:|
| **MemClaw (Intent ON)** | **68.42%** | **~2,900** |
| OpenViking + OpenClaw | 52.08% | ~2,769 |
| OpenClaw (内置记忆) | 35.65% | ~15,982 |

多跳推理（Cat 4）：**84.29%** 精度。

---

## 故障排查

### 插件无法工作

1. 运行 `openclaw skills` 检查插件加载状态
2. 检查 `openclaw.json` 配置是否正确，确认 `enabled: true`
3. 查看 OpenClaw 日志中是否有 `[memclaw]` 或 `[memclaw-context-engine]` 相关错误

### 服务无法启动

1. 检查端口 **6333**（Qdrant HTTP）、**6334**（Qdrant gRPC）、**8085**（cortex-mem-service）是否被占用
2. 确认 LLM 和 Embedding API 密钥已正确配置
3. 设置 `autoStartServices: false` 可禁用自动启动，手动管理外部服务

### 搜索结果不完整或过时

1. 手动运行 `cortex_maintenance` 触发重建索引
2. 确认 `cortex_commit_session` 已在会话完成后调用
3. 检查 cortex-mem-service 健康状态：`curl http://localhost:8085/health`

### 迁移失败

1. 确保 OpenClaw 工作区存在：`~/.openclaw/workspace`
2. 确认记忆文件存在：`~/.openclaw/workspace/memory/`
3. 迁移是幂等的，可以安全地重复运行

---

## FAQ

### MemClaw 和 Cortex Memory 是什么关系？

MemClaw 是 Cortex Memory 在 OpenClaw 生态中的**专用发行版**。Cortex Memory 是一个通用的 Rust 记忆框架，而 MemClaw 将它打包成 OpenClaw 插件（TypeScript），并预编译了所有依赖的二进制文件，做到开箱即用。

### 我需要单独安装 Qdrant 吗？

**不需要**。Qdrant 和 cortex-mem-service 已预编译并打包到 `@memclaw/bin-*` npm 包中。安装 MemClaw 插件时会自动拉取对应平台的二进制文件。

### 两个插件可以同时安装吗？

可以。Memory Plugin 提供工具供 Agent 调用，Context Engine 在生命周期层面自动管理上下文。它们共享同一个 cortex-mem-service 后端，互不冲突。

### 可以用自己的 LLM/Embedding 服务吗？

可以。只要 API 与 OpenAI 兼容（如 Azure OpenAI、Ollama、vLLM 等），配置对应的 `*ApiBaseUrl` 和 `*ApiKey` 即可。

### 记忆数据存在哪里？

记忆以 Markdown 文件形式存储在本地文件系统（可通过 `cortex://` URI 访问），同时向量索引存储在 Qdrant 中。数据完全本地化，不上传到任何外部服务。

### 支持哪些平台？

- **macOS Apple Silicon** (darwin-arm64)
- **Linux x64** (linux-x64)
- **Windows x64** (win32-x64)

---

## 文档索引

- **[Memory Plugin 详细文档](plugin/README.md)** — 安装、配置、工具参考、最佳实践
- **[Memory Plugin 中文文档](plugin/README_zh.md)** — 中文版插件文档
- **[Context Engine 技术设计](context-engine/TECH_DESIGN.md)** — Context Engine 的详细技术设计文档
- **[Agent 技能文档](plugin/skills/memclaw/SKILL.md)** — Agent 如何使用 MemClaw 工具
- **[最佳实践](plugin/skills/memclaw/references/best-practices.md)** — 工具选择、会话生命周期、搜索策略

---

## 许可证

[MIT](LICENSE)

# Core Context Engine Documentation

**Version:** 1.0  
**Domain:** Core Business Domain (MemClaw System)  
**Status:** Active  
**Last Updated:** 2026-04-05 06:07:41 (UTC)  

---

## 1. Executive Summary

The **Core Context Engine** is the intelligence layer of the MemClaw system, designed to provide persistent memory, semantic search, and context retrieval capabilities for AI agents within the OpenClaw ecosystem. It acts as the bridge between high-level agent interactions and low-level vector database operations.

Built upon a modular plugin architecture, the Core Context Engine leverages a **dual-entry point strategy** (`plugin` and `context-engine`) to ensure flexibility across host environments. Its primary responsibility is to manage the lifecycle of context processing, execute tiered semantic searches, and format retrieved data for downstream consumption by AI agents.

### Key Value Propositions
*   **Persistent Memory:** Enables agents to retain knowledge across sessions via tenant-isolated structures.
*   **Semantic Search:** Utilizes tiered indexing (L0/L1/L2) against the Qdrant vector database for efficient retrieval.
*   **Type Safety:** Implements strict TypeScript interfaces for API interactions and configuration management.
*   **Infrastructure Abstraction:** Decouples business logic from native binary management (Qdrant, Cortex-Mem).

---

## 2. System Architecture

The Core Context Engine operates within the broader MemClaw application layer. It interacts closely with the System Orchestration domain for infrastructure health and the Configuration Management domain for settings synchronization.

### 2.1 Logical Decomposition

The following diagram illustrates the position of the Core Context Engine within the MemClaw architecture, highlighting its dependencies and internal structure.

```mermaid
flowchart TD
    %% Styling
    classDef core fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef infra fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef support fill:#f3e5f5,stroke:#4a148c,stroke-width:2px;
    classDef ext fill:#ffebee,stroke:#b71c1c,stroke-width:2px,stroke-dasharray: 5 5;
    classDef entry fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;

    subgraph HostEnvironment [\"Host Environment (OpenClaw)\"]
        direction TB
        Host[OpenClaw Runtime]:::ext
    end

    subgraph MemClawApp [\"MemClaw Application Layer\"]
        direction TB
        
        subgraph PluginModule [\"Plugin Module (Orchestration & Client)\"]
            P_Index[\"plugin/index.ts<br/>(Entry Point Facade)\"]:::entry
            P_Client[\"plugin/src/client.ts<br/>(HTTP Client Facade)\"]:::core
            P_Binaries[\"plugin/src/binaries.ts<br/>(Binary Manager)\"]:::infra
            P_Config[\"plugin/src/config.ts<br/>(Config Resolver)\"]:::support
        end

        subgraph ContextEngineModule [\"Context Engine Module (Business Logic)\"]
            CE_Index[\"context-engine/index.ts<br/>(Engine Factory)\"]:::entry
            CE_Engine[\"context-engine/context-engine.ts<br/>(Context Processor)\"]:::core
            CE_Tools[\"context-engine/tools.ts<br/>(Tool Registration)\"]:::core
            CE_Config[\"context-engine/config.ts<br/>(Context Config Manager)\"]:::support
        end
    end

    subgraph ManagedInfra [\"Managed Infrastructure\"]
        Qdrant[\"Qdrant (Vector DB)\"]:::ext
        Cortex[\"Cortex-Mem Service\"]:::ext
    end

    %% Relationships
    Host --> P_Index
    Host --> CE_Index
    
    %% Core Context Engine Internal Flow
    CE_Index --> CE_Config
    CE_Index --> CE_Engine
    CE_Tools --> CE_Engine
    
    %% Cross-Domain Interaction
    P_Client -->|HTTP Requests| Cortex
    CE_Engine -->|Delegates Search| P_Client
    P_Client -->|Semantic Search| Cortex
    
    %% Infrastructure Dependency
    P_Index --> P_Binaries
    P_Binaries -->|Spawn | Qdrant
    P_Binaries -->|Spawn | Cortex
    
    %% Configuration Sync
    P_Config -.->|Sync Settings | CE_Config

    %% Legend
    linkStyle default stroke:#333,stroke-width:1px;
```

### 2.2 Component Boundaries
*   **Core Context Engine Domain:** Includes `context-engine/*.ts` and `plugin/src/client.ts`. Responsible for business logic, tool registration, and API abstraction.
*   **System Orchestration Domain:** Includes `plugin/src/binaries.ts`. Responsible for spawning the backend services (Cortex-Mem, Qdrant) that the Engine consumes.
*   **External Services:** Cortex-Mem (Port 8085) and Qdrant (Port 6333) are managed externally but logically integrated via the Client Facade.

---

## 3. Key Components

The Core Context Engine is composed of three primary sub-modules, each serving a distinct function in the memory retrieval pipeline.

### 3.1 HTTP Client Facade (`plugin/src/client.ts`)
This component acts as the communication bridge between the engine and the backend microservices.
*   **Responsibility:** Provides typed wrappers for REST API interactions with the Cortex-Mem service.
*   **Key Functions:**
    *   `fetchJson()`: Generic JSON fetcher with error handling.
    *   `semanticSearch()`: Executes queries against the vector index.
    *   `sessionCommit()`: Persists new context data.
*   **Technical Implementation:** Uses asynchronous HTTP requests. Implements retry logic and timeout configurations to ensure resilience against transient network failures.

### 3.2 Context Processor (`context-engine/context-engine.ts`)
This is the central logic unit responsible for managing the engine lifecycle and formatting data.
*   **Responsibility:** Manages engine state, processes retrieved data chunks, and formats output for the host agent.
*   **Key Functions:**
    *   `createEngine()`: Initializes the engine instance with necessary configurations.
    *   `handleContextRequest()`: Orchestrates the flow from query to response.
*   **Lifecycle:** Tied to the host environment's plugin lifecycle hooks. Ensures cleanup of resources upon shutdown.

### 3.3 Tool Registration (`context-engine/tools.ts`)
This module exposes functionality to the external OpenClaw runtime.
*   **Responsibility:** Registers tools within the host environment, enabling agents to query memory programmatically.
*   **Key Functions:**
    *   `registerTools()`: Defines the schema and handlers for available memory tools.
    *   `injectContext()`: Merges retrieved memory into the active conversation context.

---

## 4. Core Workflows

### 4.1 Context Retrieval & Semantic Search
This is the primary operational workflow where the engine demonstrates its business value.

1.  **Request Initiation:** An agent invokes a registered tool via `context-engine/tools.ts`.
2.  **Client Construction:** `plugin/src/client.ts` constructs a typed HTTP request targeting the Cortex-Mem service.
3.  **Tiered Execution:** The search executes against the Vector DB (Qdrant) using a tiered approach:
    *   **L0:** Immediate short-term memory.
    *   **L1:** Recent session context.
    *   **L2:** Long-term persistent knowledge.
4.  **Processing:** Results are returned to `context-engine/context-engine.ts`.
5.  **Formatting:** Data is sanitized and formatted for injection into the agent's prompt context.

### 4.2 Engine Initialization
Before retrieval can occur, the engine must be initialized alongside the infrastructure.

1.  **Entry:** Host loads `context-engine/index.ts`.
2.  **Configuration:** `context-engine/config.ts` defines default parameters; `plugin/src/config.ts` validates platform-specific paths.
3.  **Dependency Check:** The Engine waits for confirmation from `plugin/src/binaries.ts` that Cortex-Mem and Qdrant are healthy.
4.  **Registration:** Tools are exposed to the host environment.

---

## 5. Configuration & State Management

Proper configuration ensures consistency across different deployment environments (Windows, macOS, Linux).

### 5.1 Configuration Files
*   **`plugin/src/config.ts` (Config Resolver):** Handles TOML lifecycle, platform-specific directory resolution, and merging transient/persistent settings. This is the **Source of Truth** for path locations.
*   **`context-engine/config.ts` (Context Config Manager):** Defines the `ContextEngineConfig` interface and engine-specific defaults.

### 5.2 Best Practices
*   **Synchronization:** Ensure `context-engine/config.ts` references paths resolved by `plugin/src/config.ts` to prevent state divergence.
*   **Validation:** Implement runtime validation (e.g., Zod) in `context-engine/config.ts` to replace unsafe type assertions during config parsing.
*   **Async Loading:** While critical configuration parsing should remain synchronous for stability, service discovery should utilize asynchronous patterns to avoid blocking the main thread.

---

## 6. Integration & Dependencies

The Core Context Engine does not operate in isolation. It has strict dependencies on the System Orchestration domain.

| Dependency | Type | Description | Criticality |
| :--- | :--- | :--- | :--- |
| **System Orchestration** | Service Call | Requires Cortex-Mem to be running for API calls. | **High (10.0)** |
| **Configuration Management** | Data Dependency | Requires valid paths for log storage and tenant directories. | **Medium-High (8.5)** |
| **Migration & Compliance** | Tool Support | May invoke binaries to regenerate indices post-migration. | **Medium (7.0)** |

---

## 7. Technical Considerations & Known Issues

Based on architectural validation and drift analysis, the following considerations apply to developers maintaining this module.

### 7.1 Binary Management Duplication
*   **Observation:** There are two files potentially managing binaries: `plugin/src/binaries.ts` and `context-engine/binaries.ts`.
*   **Risk:** Logic duplication may lead to inconsistent service spawning behavior.
*   **Recommendation:** Consolidate binary spawning logic into `plugin/src/binaries.ts`. Verify if `context-engine/binaries.ts` serves a specialized utility role or if it is deprecated.

### 7.2 Performance Optimization
*   **Current State:** Migration and heavy configuration tasks currently utilize synchronous file I/O.
*   **Impact:** Potential performance bottlenecks on large datasets.
*   **Recommendation:** Adopt asynchronous file streams in migration utilities (`migrate.ts`) to improve scalability without compromising startup stability.

### 7.3 Error Handling Standardization
*   **Current State:** HTTP configuration and error handling may vary across methods in `plugin/src/client.ts`.
*   **Recommendation:** Centralize HTTP configuration and error handling middleware within the Client Facade to eliminate boilerplate duplication and ensure consistent failure modes.

### 7.4 Security & Compliance
*   **Tenant Isolation:** Ensure all memory operations respect tenant boundaries defined in the configuration.
*   **Guideline Enforcement:** The `agents-md-injector.ts` module idempotently injects guidelines into `AGENTS.md`. Ensure this process does not conflict with user edits.

---

## 8. Appendix: File Reference

| File Path | Module | Responsibility |
| :--- | :--- | :--- |
| `context-engine/index.ts` | Entry Point | Engine Factory initialization. |
| `context-engine/context-engine.ts` | Core Logic | Context processing and lifecycle. |
| `context-engine/tools.ts` | Interface | Tool registration for Host Agents. |
| `context-engine/config.ts` | Support | Engine-specific configuration interfaces. |
| `plugin/src/client.ts` | Core Logic | HTTP Client Facade for Cortex-Mem. |
| `plugin/src/binaries.ts` | Infra | Binary discovery and service spawning. |
| `plugin/src/config.ts` | Support | Platform path resolution and TOML parsing. |
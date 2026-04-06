"use strict";
/**
 * Cortex Mem Client for Context Engine
 *
 * Extended HTTP client for cortex-mem-service REST API with Context Engine support.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CortexMemClient = void 0;
// ==================== Client Class ====================
class CortexMemClient {
    baseUrl;
    timeoutMs;
    constructor(baseUrl = 'http://localhost:8085', timeoutMs = 30000) {
        this.baseUrl = baseUrl;
        this.timeoutMs = timeoutMs;
    }
    // ==================== Search ====================
    async search(options) {
        const response = await this.fetchJson('/api/v2/search', {
            method: 'POST',
            body: JSON.stringify({
                query: options.query,
                thread: options.scope,
                limit: options.limit ?? 10,
                min_score: options.min_score ?? 0.6,
                return_layers: options.return_layers ?? ['L0']
            })
        });
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Search failed');
        }
        return response.data;
    }
    async recall(query, scope, limit = 10) {
        return this.search({
            query,
            scope,
            limit,
            return_layers: ['L0', 'L2']
        });
    }
    // ==================== Filesystem ====================
    async ls(options = {}) {
        const params = new URLSearchParams();
        params.set('uri', options.uri ?? 'cortex://session');
        if (options.recursive)
            params.set('recursive', 'true');
        if (options.include_abstracts)
            params.set('include_abstracts', 'true');
        const response = await this.fetchJson(`/api/v2/filesystem/list?${params.toString()}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'List directory failed');
        }
        return response.data;
    }
    async getAbstract(uri) {
        const params = new URLSearchParams();
        params.set('uri', uri);
        const response = await this.fetchJson(`/api/v2/filesystem/abstract?${params.toString()}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Get abstract failed');
        }
        return response.data;
    }
    async getOverview(uri) {
        const params = new URLSearchParams();
        params.set('uri', uri);
        const response = await this.fetchJson(`/api/v2/filesystem/overview?${params.toString()}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Get overview failed');
        }
        return response.data;
    }
    async getContent(uri) {
        const params = new URLSearchParams();
        params.set('uri', uri);
        const response = await this.fetchJson(`/api/v2/filesystem/content?${params.toString()}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Get content failed');
        }
        return response.data;
    }
    // ==================== Session Management ====================
    async getSession(threadId) {
        const response = await this.fetchJson(`/api/v2/sessions/${threadId}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Get session failed');
        }
        return response.data;
    }
    async addMessage(threadId, message) {
        const response = await this.fetchJson(`/api/v2/sessions/${threadId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                role: message.role ?? 'user',
                content: message.content,
                metadata: message.metadata
            })
        });
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Add message failed');
        }
        return response.data;
    }
    async commitSession(threadId, options) {
        const wait = options?.wait ?? false;
        const timeoutMs = options?.timeoutMs ?? 120000;
        const response = await this.fetchJson(`/api/v2/sessions/${threadId}/close`, {
            method: 'POST',
            body: JSON.stringify({ wait })
        }, timeoutMs);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Commit session failed');
        }
        const result = response.data;
        // If wait=true and we have a task_id, poll for completion
        if (wait && result.task_id && result.status === 'accepted') {
            return this.pollCommitCompletion(threadId, result.task_id, timeoutMs);
        }
        return result;
    }
    async pollCommitCompletion(threadId, taskId, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        const pollInterval = 500;
        while (Date.now() < deadline) {
            await this.sleep(pollInterval);
            const task = await this.getTask(taskId).catch(() => null);
            if (!task)
                break;
            if (task.status === 'completed') {
                return {
                    thread_id: threadId,
                    status: 'completed',
                    message_count: 0,
                    task_id: taskId,
                    memories_extracted: task.result?.memories_extracted ?? {}
                };
            }
            if (task.status === 'failed') {
                return {
                    thread_id: threadId,
                    status: 'failed',
                    message_count: 0,
                    task_id: taskId,
                    error: task.error ?? 'Unknown error'
                };
            }
        }
        return {
            thread_id: threadId,
            status: 'timeout',
            message_count: 0,
            task_id: taskId
        };
    }
    async getTask(taskId) {
        const response = await this.fetchJson(`/api/v2/tasks/${taskId}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Get task failed');
        }
        return response.data;
    }
    // ==================== Context Engine APIs ====================
    async getSessionContext(sessionId, tokenBudget = 128000) {
        const response = await this.fetchJson(`/api/v2/sessions/${sessionId}/context?token_budget=${tokenBudget}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Get session context failed');
        }
        return response.data;
    }
    async getSessionArchive(sessionId, archiveId) {
        const response = await this.fetchJson(`/api/v2/sessions/${sessionId}/archives/${archiveId}`);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Get session archive failed');
        }
        return response.data;
    }
    // ==================== Tenant ====================
    async switchTenant(tenantId) {
        const response = await this.fetchJson('/api/v2/tenants/switch', {
            method: 'POST',
            body: JSON.stringify({ tenant_id: tenantId })
        });
        if (!response.success) {
            throw new Error(response.error ?? 'Switch tenant failed');
        }
    }
    // ==================== Delete ====================
    async deleteUri(uri) {
        const response = await this.fetchJson(`/api/v2/filesystem?uri=${encodeURIComponent(uri)}&recursive=false`, {
            method: 'DELETE'
        });
        if (!response.success) {
            throw new Error(response.error ?? 'Delete URI failed');
        }
    }
    // ==================== Health Check ====================
    async healthCheck() {
        try {
            const response = await this.fetchJson('/health');
            return response.status === 'ok' || response.status === 'healthy';
        }
        catch {
            return false;
        }
    }
    // ==================== Internal ====================
    async fetchJson(path, options = {}, timeoutMs) {
        const url = `${this.baseUrl}${path}`;
        const controller = new AbortController();
        const timeout = timeoutMs ?? this.timeoutMs;
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        }
        finally {
            clearTimeout(timer);
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.CortexMemClient = CortexMemClient;
//# sourceMappingURL=client.js.map
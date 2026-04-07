"use strict";
/**
 * Cortex Mem Client for Context Engine
 *
 * HTTP client for cortex-mem-service REST API.
 * Optimized for minimal token consumption:
 * - Batch message writes
 * - No polling or unnecessary API calls
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
    /**
     * Batch write messages to session timeline.
     * Single HTTP call instead of N individual calls.
     */
    async addMessages(threadId, messages) {
        if (messages.length === 0)
            return 0;
        const response = await this.fetchJson(`/api/v2/sessions/${threadId}/messages/bulk`, {
            method: 'POST',
            body: JSON.stringify({
                messages: messages.map(m => ({
                    role: m.role ?? 'user',
                    content: m.content,
                    metadata: m.metadata
                }))
            })
        });
        if (!response.success) {
            // Fallback: write messages one by one
            let added = 0;
            for (const msg of messages) {
                try {
                    await this.addMessage(threadId, msg);
                    added++;
                }
                catch (err) {
                    // Log but continue — caller can compare returned count with input length
                    console.error(`[cortex-mem] addMessages fallback: failed to write message: ${err}`);
                }
            }
            return added;
        }
        return response.data?.added ?? messages.length;
    }
    /**
     * Close session to trigger memory extraction.
     * Non-blocking by default - fire and forget.
     */
    async closeSession(threadId, wait = false) {
        const timeoutMs = wait ? 120000 : 10000;
        const response = await this.fetchJson(`/api/v2/sessions/${threadId}/close`, {
            method: 'POST',
            body: JSON.stringify({ wait })
        }, timeoutMs);
        if (!response.success || !response.data) {
            throw new Error(response.error ?? 'Close session failed');
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
}
exports.CortexMemClient = CortexMemClient;
//# sourceMappingURL=client.js.map
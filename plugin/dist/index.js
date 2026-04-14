"use strict";
/**
 * MemClaw - Layered Semantic Memory for OpenClaw
 *
 * Provides:
 * - L0/L1/L2 tiered memory retrieval
 * - Automatic service startup (Qdrant + cortex-mem-service)
 * - Migration from OpenClaw native memory
 *
 * Installation:
 *   openclaw plugins install memclaw
 *
 * Configuration (in openclaw.json):
 *   {
 *     "plugins": {
 *       "entries": {
 *         "memclaw": {
 *           "enabled": true,
 *           "config": {
 *             "serviceUrl": "http://localhost:8085",
 *             "tenantId": "tenant_claw",
 *             "autoStartServices": true
 *           }
 *         }
 *       }
 *     }
 *   }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = exports.createMemoryPluginCapability = exports.createMemoryRuntime = exports.createMemoryFlushPlanResolver = exports.createMemoryPromptSectionBuilder = exports.closeAllMemorySearchManagers = exports.getMemorySearchManager = exports.CortexMemorySearchManager = void 0;
exports.default = memclawPlugin;
const plugin_impl_js_1 = require("./plugin-impl.js");
// Memory Adapter exports (for OpenClaw memory plugin integration)
var memory_adapter_js_1 = require("./src/memory-adapter.js");
Object.defineProperty(exports, "CortexMemorySearchManager", { enumerable: true, get: function () { return memory_adapter_js_1.CortexMemorySearchManager; } });
Object.defineProperty(exports, "getMemorySearchManager", { enumerable: true, get: function () { return memory_adapter_js_1.getMemorySearchManager; } });
Object.defineProperty(exports, "closeAllMemorySearchManagers", { enumerable: true, get: function () { return memory_adapter_js_1.closeAllMemorySearchManagers; } });
// OpenClaw official API factory functions
Object.defineProperty(exports, "createMemoryPromptSectionBuilder", { enumerable: true, get: function () { return memory_adapter_js_1.createMemoryPromptSectionBuilder; } });
Object.defineProperty(exports, "createMemoryFlushPlanResolver", { enumerable: true, get: function () { return memory_adapter_js_1.createMemoryFlushPlanResolver; } });
Object.defineProperty(exports, "createMemoryRuntime", { enumerable: true, get: function () { return memory_adapter_js_1.createMemoryRuntime; } });
// Legacy compatibility
Object.defineProperty(exports, "createMemoryPluginCapability", { enumerable: true, get: function () { return memory_adapter_js_1.createMemoryPluginCapability; } });
// Default export - main plugin function
function memclawPlugin(api) {
    return (0, plugin_impl_js_1.createPlugin)(api);
}
// Named export - object style registration
exports.plugin = {
    id: 'memclaw',
    name: 'MemClaw',
    version: '0.9.50',
    configSchema: {
        type: 'object',
        properties: {
            serviceUrl: { type: 'string', default: 'http://localhost:8085' },
            defaultSessionId: { type: 'string', default: 'default' },
            searchLimit: { type: 'integer', default: 10 },
            minScore: { type: 'number', default: 0.6 },
            tenantId: { type: 'string', default: 'tenant_claw' },
            autoStartServices: { type: 'boolean', default: true }
        },
        required: []
    },
    register(api) {
        return (0, plugin_impl_js_1.createPlugin)(api);
    }
};
//# sourceMappingURL=index.js.map
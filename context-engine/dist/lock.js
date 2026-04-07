"use strict";
/**
 * Service lock management using PID files
 *
 * Provides cross-process coordination to prevent multiple instances
 * from starting the same service simultaneously.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPidFilePath = getPidFilePath;
exports.readPidFile = readPidFile;
exports.writePidFile = writePidFile;
exports.removePidFile = removePidFile;
exports.isProcessRunning = isProcessRunning;
exports.acquireServiceLock = acquireServiceLock;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_js_1 = require("./config.js");
/**
 * Get the path to the PID file for a service
 */
function getPidFilePath(serviceName) {
    const dataDir = (0, config_js_1.getDataDir)();
    return path.join(dataDir, `${serviceName}.pid`);
}
/**
 * Read PID from file. Returns null if file doesn't exist or is invalid.
 */
function readPidFile(serviceName) {
    const pidPath = getPidFilePath(serviceName);
    try {
        const content = fs.readFileSync(pidPath, 'utf-8').trim();
        const pid = parseInt(content, 10);
        if (Number.isFinite(pid) && pid > 0) {
            return pid;
        }
    }
    catch {
        // File doesn't exist or can't be read
    }
    return null;
}
/**
 * Write PID to file
 */
function writePidFile(serviceName, pid) {
    const pidPath = getPidFilePath(serviceName);
    fs.writeFileSync(pidPath, String(pid), 'utf-8');
}
/**
 * Remove PID file
 */
function removePidFile(serviceName) {
    const pidPath = getPidFilePath(serviceName);
    try {
        fs.unlinkSync(pidPath);
    }
    catch {
        // Ignore errors
    }
}
/**
 * Check if a process with the given PID is running
 */
function isProcessRunning(pid) {
    try {
        // Sending signal 0 checks if process exists without killing it
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Attempt to acquire a lock for starting a service.
 * Returns true if lock acquired (safe to start), false if service already running.
 */
function acquireServiceLock(serviceName, log) {
    const existingPid = readPidFile(serviceName);
    if (existingPid !== null) {
        if (isProcessRunning(existingPid)) {
            log?.(`${serviceName} is already running (PID: ${existingPid})`);
            return false;
        }
        // Stale PID file - process is dead, clean up
        log?.(`Removing stale PID file for ${serviceName} (PID: ${existingPid})`);
        removePidFile(serviceName);
    }
    return true;
}
//# sourceMappingURL=lock.js.map
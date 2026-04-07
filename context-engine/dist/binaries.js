"use strict";
/**
 * Binary management for MemClaw Context Engine
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
exports.getPlatform = getPlatform;
exports.isPlatformSupported = isPlatformSupported;
exports.getUnsupportedPlatformMessage = getUnsupportedPlatformMessage;
exports.getBinaryPath = getBinaryPath;
exports.isBinaryAvailable = isBinaryAvailable;
exports.isPlatformPackageInstalled = isPlatformPackageInstalled;
exports.getInstallInstructions = getInstallInstructions;
exports.checkServiceStatus = checkServiceStatus;
exports.startQdrant = startQdrant;
exports.startCortexMemService = startCortexMemService;
exports.stopAllServices = stopAllServices;
exports.ensureAllServices = ensureAllServices;
exports.getCliPath = getCliPath;
exports.executeCliCommand = executeCliCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const config_js_1 = require("./config.js");
// ==================== Platform Detection ====================
function getPlatform() {
    const platform = process.platform;
    const arch = process.arch;
    if (platform === 'darwin' && arch === 'arm64') {
        return 'darwin-arm64';
    }
    else if (platform === 'win32' && arch === 'x64') {
        return 'win-x64';
    }
    else if (platform === 'linux' && arch === 'x64') {
        return 'linux-x64';
    }
    return null;
}
function isPlatformSupported() {
    return getPlatform() !== null;
}
function getUnsupportedPlatformMessage() {
    const platform = process.platform;
    const arch = process.arch;
    return `
MemClaw is only supported on:
  - macOS Apple Silicon (darwin-arm64)
  - Windows x64 (win-x64)
  - Linux x64 (linux-x64)

Current platform: ${platform}-${arch} is not supported.
`;
}
// ==================== Binary Paths ====================
function getBinaryFileName(binary) {
    return process.platform === 'win32' ? `${binary}.exe` : binary;
}
function getPlatformPackagePath() {
    const platform = getPlatform();
    if (!platform)
        return null;
    const packageName = `@memclaw/bin-${platform}`;
    try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`);
        return path.dirname(packageJsonPath);
    }
    catch {
        return null;
    }
}
function getBinaryPath(binary) {
    const packagePath = getPlatformPackagePath();
    if (!packagePath)
        return null;
    const binaryFileName = getBinaryFileName(binary);
    const binaryPath = path.join(packagePath, 'bin', binaryFileName);
    if (fs.existsSync(binaryPath)) {
        return binaryPath;
    }
    return null;
}
function isBinaryAvailable(binary) {
    return getBinaryPath(binary) !== null;
}
function isPlatformPackageInstalled() {
    return getPlatformPackagePath() !== null;
}
function getInstallInstructions() {
    const platform = getPlatform();
    if (!platform)
        return getUnsupportedPlatformMessage();
    const packageName = `@memclaw/bin-${platform}`;
    return `
Platform binaries not found for ${platform}.

Try running: npm install ${packageName}
`;
}
async function checkServiceStatus() {
    const qdrant = await isQdrantRunning();
    const cortexMemService = await isServiceRunning(8085);
    return { qdrant, cortexMemService };
}
async function isQdrantRunning() {
    try {
        const response = await fetch(`http://localhost:6333/collections`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        return response.ok || response.status === 200;
    }
    catch {
        try {
            const response = await fetch(`http://localhost:6333`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            });
            return response.status === 200;
        }
        catch {
            return false;
        }
    }
}
async function isServiceRunning(port) {
    try {
        const response = await fetch(`http://localhost:${port}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        return response.ok;
    }
    catch {
        return false;
    }
}
// ==================== Process Management ====================
const runningProcesses = new Map();
// PID file management for cross-process coordination
function getPidFilePath(serviceName) {
    const dataDir = (0, config_js_1.getDataDir)();
    return path.join(dataDir, `${serviceName}.pid`);
}
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
function writePidFile(serviceName, pid) {
    const pidPath = getPidFilePath(serviceName);
    fs.writeFileSync(pidPath, String(pid), 'utf-8');
}
function removePidFile(serviceName) {
    const pidPath = getPidFilePath(serviceName);
    try {
        fs.unlinkSync(pidPath);
    }
    catch {
        // Ignore errors
    }
}
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
async function startQdrant(log) {
    // Use PID file lock to prevent race conditions across processes
    if (!acquireServiceLock('qdrant', log)) {
        return;
    }
    // Double-check via HTTP (in case another process started it)
    const status = await checkServiceStatus();
    if (status.qdrant) {
        log?.('Qdrant is already running');
        return;
    }
    const binaryPath = getBinaryPath('qdrant');
    if (!binaryPath) {
        throw new Error(`Qdrant binary not found. ${getInstallInstructions()}`);
    }
    try {
        fs.chmodSync(binaryPath, 0o755);
    }
    catch (err) {
        log?.(`Warning: Could not set execute permission: ${err}`);
    }
    const dataDir = (0, config_js_1.getDataDir)();
    const storagePath = path.join(dataDir, 'qdrant-storage');
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }
    const qdrantConfigPath = path.join(dataDir, 'qdrant-config.yaml');
    const qdrantConfig = `# Qdrant configuration for MemClaw
storage:
  storage_path: ${storagePath}

listeners:
  http:
    port: 6333
  grpc:
    port: 6334

log_level: INFO
`;
    fs.writeFileSync(qdrantConfigPath, qdrantConfig, 'utf-8');
    log?.(`Starting Qdrant with storage at ${storagePath}...`);
    const proc = (0, child_process_1.spawn)(binaryPath, ['--config-path', qdrantConfigPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        cwd: dataDir
    });
    proc.stdout?.on('data', (data) => {
        log?.(`[qdrant] ${data.toString().trim()}`);
    });
    proc.stderr?.on('data', (data) => {
        log?.(`[qdrant stderr] ${data.toString().trim()}`);
    });
    proc.on('error', (err) => {
        log?.(`Qdrant error: ${err.message}`);
        removePidFile('qdrant');
    });
    proc.on('exit', () => {
        removePidFile('qdrant');
    });
    proc.unref();
    runningProcesses.set('qdrant', proc);
    // Write PID file after spawn
    if (proc.pid) {
        writePidFile('qdrant', proc.pid);
    }
    // Wait for Qdrant to start
    let retries = 30;
    while (retries > 0) {
        const status = await checkServiceStatus();
        if (status.qdrant) {
            log?.('Qdrant started successfully');
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        retries--;
    }
    throw new Error('Qdrant failed to start within 15 seconds');
}
async function startCortexMemService(log) {
    // Use PID file lock to prevent race conditions across processes
    if (!acquireServiceLock('cortex-mem-service', log)) {
        return;
    }
    // Double-check via HTTP (in case another process started it)
    const status = await checkServiceStatus();
    if (status.cortexMemService) {
        log?.('cortex-mem-service is already running');
        return;
    }
    const binaryPath = getBinaryPath('cortex-mem-service');
    if (!binaryPath) {
        throw new Error(`cortex-mem-service binary not found. ${getInstallInstructions()}`);
    }
    try {
        fs.chmodSync(binaryPath, 0o755);
    }
    catch (err) {
        log?.(`Warning: Could not set execute permission: ${err}`);
    }
    const dataDir = (0, config_js_1.getDataDir)();
    const logsDir = path.join(dataDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFilePath = path.join(logsDir, 'memclaw-context-engine.log');
    log?.('Starting cortex-mem-service...');
    const proc = (0, child_process_1.spawn)(binaryPath, ['--data-dir', dataDir, '--log-file', logFilePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        cwd: dataDir
    });
    proc.stdout?.on('data', (data) => {
        log?.(`[cortex-mem-service] ${data.toString().trim()}`);
    });
    proc.stderr?.on('data', (data) => {
        log?.(`[cortex-mem-service stderr] ${data.toString().trim()}`);
    });
    proc.on('error', (err) => {
        log?.(`cortex-mem-service error: ${err.message}`);
        removePidFile('cortex-mem-service');
    });
    proc.on('exit', () => {
        removePidFile('cortex-mem-service');
    });
    proc.unref();
    runningProcesses.set('cortex-mem-service', proc);
    // Write PID file after spawn
    if (proc.pid) {
        writePidFile('cortex-mem-service', proc.pid);
    }
    // Wait for service to start
    let retries = 30;
    while (retries > 0) {
        const status = await checkServiceStatus();
        if (status.cortexMemService) {
            log?.('cortex-mem-service started successfully');
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        retries--;
    }
    throw new Error('cortex-mem-service failed to start within 15 seconds');
}
function stopAllServices(log) {
    for (const [name, proc] of runningProcesses) {
        try {
            proc.kill();
            removePidFile(name);
            log?.(`Stopped ${name}`);
        }
        catch (err) {
            log?.(`Failed to stop ${name}: ${err}`);
        }
    }
    runningProcesses.clear();
}
async function ensureAllServices(log) {
    if (!isPlatformSupported()) {
        log?.(getUnsupportedPlatformMessage());
        return { qdrant: false, cortexMemService: false };
    }
    if (!isPlatformPackageInstalled()) {
        log?.(`Warning: Platform binaries not installed. ${getInstallInstructions()}`);
        return { qdrant: false, cortexMemService: false };
    }
    const status = await checkServiceStatus();
    if (!status.qdrant) {
        await startQdrant(log);
    }
    if (!status.cortexMemService) {
        await startCortexMemService(log);
    }
    return checkServiceStatus();
}
// ==================== CLI Execution ====================
function getCliPath() {
    return getBinaryPath('cortex-mem-cli');
}
async function executeCliCommand(args, configPath, tenantId, timeout = 120000) {
    const cliPath = getCliPath();
    if (!cliPath) {
        return {
            success: false,
            stdout: '',
            stderr: 'cortex-mem-cli binary not found',
            exitCode: 1,
        };
    }
    const fullArgs = ['--config', configPath, '--tenant', tenantId, ...args];
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        const proc = (0, child_process_1.spawn)(cliPath, fullArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        const timer = setTimeout(() => {
            proc.kill();
            resolve({
                success: false,
                stdout,
                stderr: stderr + '\nCommand timed out',
                exitCode: null,
            });
        }, timeout);
        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({
                success: code === 0,
                stdout,
                stderr,
                exitCode: code,
            });
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                success: false,
                stdout,
                stderr: err.message,
                exitCode: 1,
            });
        });
    });
}
//# sourceMappingURL=binaries.js.map
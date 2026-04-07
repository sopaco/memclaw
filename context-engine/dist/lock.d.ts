/**
 * Service lock management using PID files
 *
 * Provides cross-process coordination to prevent multiple instances
 * from starting the same service simultaneously.
 */
/**
 * Get the path to the PID file for a service
 */
export declare function getPidFilePath(serviceName: string): string;
/**
 * Read PID from file. Returns null if file doesn't exist or is invalid.
 */
export declare function readPidFile(serviceName: string): number | null;
/**
 * Write PID to file
 */
export declare function writePidFile(serviceName: string, pid: number): void;
/**
 * Remove PID file
 */
export declare function removePidFile(serviceName: string): void;
/**
 * Check if a process with the given PID is running
 */
export declare function isProcessRunning(pid: number): boolean;
/**
 * Attempt to acquire a lock for starting a service.
 * Returns true if lock acquired (safe to start), false if service already running.
 */
export declare function acquireServiceLock(serviceName: string, log?: (msg: string) => void): boolean;
//# sourceMappingURL=lock.d.ts.map
/**
 * Service lock management using PID files
 *
 * Provides cross-process coordination to prevent multiple instances
 * from starting the same service simultaneously.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDataDir } from './config.js';

/**
 * Get the path to the PID file for a service
 */
export function getPidFilePath(serviceName: string): string {
	const dataDir = getDataDir()
	return path.join(dataDir, `${serviceName}.pid`)
}

/**
 * Read PID from file. Returns null if file doesn't exist or is invalid.
 */
export function readPidFile(serviceName: string): number | null {
	const pidPath = getPidFilePath(serviceName)
	try {
		const content = fs.readFileSync(pidPath, 'utf-8').trim()
		const pid = parseInt(content, 10)
		if (Number.isFinite(pid) && pid > 0) {
			return pid
		}
	} catch {
		// File doesn't exist or can't be read
	}
	return null
}

/**
 * Write PID to file
 */
export function writePidFile(serviceName: string, pid: number): void {
	const pidPath = getPidFilePath(serviceName)
	fs.writeFileSync(pidPath, String(pid), 'utf-8')
}

/**
 * Remove PID file
 */
export function removePidFile(serviceName: string): void {
	const pidPath = getPidFilePath(serviceName)
	try {
		fs.unlinkSync(pidPath)
	} catch {
		// Ignore errors
	}
}

/**
 * Check if a process with the given PID is running
 */
export function isProcessRunning(pid: number): boolean {
	try {
		// Sending signal 0 checks if process exists without killing it
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

/**
 * Attempt to acquire a lock for starting a service.
 * Returns true if lock acquired (safe to start), false if service already running.
 */
export function acquireServiceLock(serviceName: string, log?: (msg: string) => void): boolean {
	const existingPid = readPidFile(serviceName)
	if (existingPid !== null) {
		if (isProcessRunning(existingPid)) {
			log?.(`${serviceName} is already running (PID: ${existingPid})`)
			return false
		}
		// Stale PID file - process is dead, clean up
		log?.(`Removing stale PID file for ${serviceName} (PID: ${existingPid})`)
		removePidFile(serviceName)
	}
	return true
}

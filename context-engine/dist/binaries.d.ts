/**
 * Binary management for MemClaw Context Engine
 */
type SupportedPlatform = 'darwin-arm64' | 'win-x64' | 'linux-x64';
export declare function getPlatform(): SupportedPlatform | null;
export declare function isPlatformSupported(): boolean;
export declare function getUnsupportedPlatformMessage(): string;
export declare function getBinaryPath(binary: string): string | null;
export declare function isBinaryAvailable(binary: string): boolean;
export declare function isPlatformPackageInstalled(): boolean;
export declare function getInstallInstructions(): string;
export interface ServiceStatus {
    qdrant: boolean;
    cortexMemService: boolean;
}
export declare function checkServiceStatus(): Promise<ServiceStatus>;
export declare function startQdrant(log?: (msg: string) => void): Promise<void>;
export declare function startCortexMemService(log?: (msg: string) => void): Promise<void>;
export declare function stopAllServices(): void;
export declare function ensureAllServices(log?: (msg: string) => void): Promise<ServiceStatus>;
export declare function getCliPath(): string | null;
export interface CliResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
}
export declare function executeCliCommand(args: string[], configPath: string, tenantId: string, timeout?: number): Promise<CliResult>;
export {};
//# sourceMappingURL=binaries.d.ts.map
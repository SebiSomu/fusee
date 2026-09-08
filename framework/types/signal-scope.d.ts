export declare function pushSignalScope(scopeId: string): void
export declare function popSignalScope(): void
export declare function withSignalScope<T>(scopeId: string, fn: () => T): T
export declare function resolveSignalValue<T>(initial: T): { value: T; hydrated: boolean }
export declare function loadSignalRegistry(snapshot: Record<string, any[]>): void
export declare function extractSignalRegistrySnapshot(): Record<string, any[]>
export declare function clearSignalRegistry(): void
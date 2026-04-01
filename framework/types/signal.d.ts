// ─── Signal Types ────────────────────────────────────────────────────────────

export type SignalAccessor<T> = {
    (): T;
    (newValue: T): void;
}

export type ComputedAccessor<T> = {
    (): T;
}

export type Signal<T = any> = SignalAccessor<T>
export type Computed<T = any> = ComputedAccessor<T>

export type EffectRunner = {
    (): void;
    deps: Set<Set<EffectRunner>>;
}

export declare function signal<T>(initialValue: T): Signal<T>
export declare function effect(fn: () => void): () => void
export declare function setEffectHook(fn: (eff: any) => void): void
export declare function computed<T>(fn: () => T): Computed<T>
export declare function batch<T>(fn: () => T): T
export declare function untrack<T>(fn: () => T): T


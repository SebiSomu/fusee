// ─── Signal Types ────────────────────────────────────────────────────────────

export type SignalAccessor<T> = {
    (): T;
    (newValue: T): void;
    isSignal: boolean;
}

export type ComputedAccessor<T> = {
    (): T;
    isSignal: boolean;
    readonly: true;
}

export type Signal<T = any> = SignalAccessor<T>
export type Computed<T = any> = ComputedAccessor<T>

type EffectRunner = {
    (): void;
    deps: Set<Set<EffectRunner>>;
}

export declare function signal<T>(initialValue: T): Signal<T>
export declare function effect(fn: () => void): () => void
export declare function computed<T>(fn: () => T): Computed<T>
export declare function batch<T>(fn: () => T): T
export declare function untrack<T>(fn: () => T): T

declare function setEffectHook(fn: (eff: any) => void): void


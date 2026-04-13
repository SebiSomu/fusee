// ─── Signal Types ────────────────────────────────────────────────────────────

export type SignalAccessor<T> = {
    (): T;
    (newValue: T): void;
    isSignal: boolean;
}

export type ArraySignalAccessor<T extends any[]> = SignalAccessor<T> & {
    push(...items: T[number][]): number;
    pop(): T[number] | undefined;
    shift(): T[number] | undefined;
    unshift(...items: T[number][]): number;
    splice(start: number, deleteCount: number, ...items: T[number][]): T[number][];
    remove(predicate: (item: T[number], index: number) => boolean): void;
    clear(): void;
    sort(compareFn?: (a: T[number], b: T[number]) => number): ArraySignalAccessor<T>;
    reverse(): ArraySignalAccessor<T>;
}

export type ComputedAccessor<T> = {
    (): T;
    isSignal: boolean;
    readonly: true;
}

export type Signal<T = any> = T extends any[] ? ArraySignalAccessor<T> : SignalAccessor<T>
export type Computed<T = any> = ComputedAccessor<T>

type EffectRunner = {
    (): void;
    deps: Set<Set<EffectRunner>>;
}

export declare function signal<T extends any[]>(initialValue: T): ArraySignalAccessor<T>
export declare function signal<T>(initialValue: T): SignalAccessor<T>
export declare function effect(fn: () => void): () => void
export declare function computed<T>(fn: () => T): Computed<T>
export declare function batch<T>(fn: () => T): T
export declare function untrack<T>(fn: () => T): T
export declare function inspect(...args: any[]): (() => void) | void

declare function setEffectHook(fn: (eff: any) => void): void


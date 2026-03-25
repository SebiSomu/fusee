// ─── Signal Types ────────────────────────────────────────────────────────────

export type SignalAccessor<T> = {
  (): T;
  (newValue: T): void;
}

export type Signal<T = any> = SignalAccessor<T>

export type EffectRunner = {
  (): void;
  deps: Set<Set<EffectRunner>>;
}

export declare function signal<T>(initialValue: T): Signal<T>
export declare function effect(fn: () => void): EffectRunner
export declare function computed<T>(fn: () => T): Signal<T>

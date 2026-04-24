export type SignalAccessor<T> = {
    (): T;
    (newValue: T): void;
    isSignal: boolean;
}

export interface ReactiveArrayMethods<T> {
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U): Computed<U[]>;
    filter(predicate: (value: T, index: number, array: T[]) => boolean): Computed<T[]>;
    slice(start?: number, end?: number): Computed<T[]>;
    reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): Computed<U>;
    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): Computed<T>;
    find(predicate: (value: T, index: number, obj: T[]) => boolean): Computed<T | undefined>;
    findLast(predicate: (value: T, index: number, obj: T[]) => boolean): Computed<T | undefined>;
    findIndex(predicate: (value: T, index: number, obj: T[]) => boolean): Computed<number>;
    findLastIndex(predicate: (value: T, index: number, obj: T[]) => boolean): Computed<number>;
    every(predicate: (value: T, index: number, array: T[]) => boolean): Computed<boolean>;
    some(predicate: (value: T, index: number, array: T[]) => boolean): Computed<boolean>;
    includes(searchElement: T, fromIndex?: number): Computed<boolean>;
    indexOf(searchElement: T, fromIndex?: number): Computed<number>;
    lastIndexOf(searchElement: T, fromIndex?: number): Computed<number>;
    at(index: number): Computed<T | undefined>;
    concat(...items: (T | T[])[]): Computed<T[]>;
    flat<depth extends number = 1>(depth?: depth): Computed<any[]>;
    flatMap<U>(callback: (value: T, index: number, array: T[]) => U | U[]): Computed<U[]>;
    join(separator?: string): Computed<string>;
}

export type ArraySignalAccessor<T extends any[]> = SignalAccessor<T> & ReactiveArrayMethods<T[number]> & {
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
} & (T extends any[] ? ReactiveArrayMethods<T[number]> : {})

export type Signal<T = any> = SignalAccessor<T> & (T extends any[] ? ReactiveArrayMethods<T[number]> : {})
export type Computed<T = any> = ComputedAccessor<T> & (T extends any[] ? ReactiveArrayMethods<T[number]> : {})

type EffectRunner = {
    (): void;
    deps: Set<Set<EffectRunner>>;
}

export type WatchSource<T = any> = (() => T) | Signal<T> | Computed<T>
export type WatchCallback<T = any> = (newValue: T, oldValue: T | undefined, onCleanup: (fn: () => void) => void) => void

export interface WatchOptions {
    immediate?: boolean;
    equals?: (a: any, b: any) => boolean;
}

export declare function signal<T extends any[]>(initialValue: T): ArraySignalAccessor<T>
export declare function signal<T>(initialValue: T): SignalAccessor<T>
export declare function effect(fn: () => void): () => void
export declare function computed<T>(fn: () => T): Computed<T>
export declare function batch<T>(fn: () => T): T
export declare function untrack<T>(fn: () => T): T
export declare function watch<T>(source: WatchSource<T>, callback: WatchCallback<T>, options?: WatchOptions): () => void
export declare function watch<T extends any[]>(
    sources: [...{ [K in keyof T]: WatchSource<T[K]> }],
    callback: (newValue: T, oldValue: T | undefined, onCleanup: (fn: () => void) => void) => void,
    options?: WatchOptions
): () => void
export declare function inspect(...args: any[]): (() => void) | void
export declare function onCleanup(fn: () => void): void

declare function setEffectHook(fn: (eff: any) => void): void


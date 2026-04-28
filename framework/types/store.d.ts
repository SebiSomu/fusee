export interface Store<T> {
    readonly id: string;
    readonly type: 'store';
    patch(partial: Partial<{ [K in keyof T]: T[K] extends (...args: any[]) => any ? ReturnType<T[K]> : T[K] }> | ((state: T) => void)): void;
}

export function defineStore<T>(id: string, setup: () => T): () => T & Store<T>;
export function resetStore(id: string): void;
export function clearStores(): void;
export function registerStorePlugin(plugin: (store: any, id: string) => void): void;

export type StoreToRefs<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => infer R ? import('./signal').SignalAccessor<R> : never
}

export function storeToRefs<T>(store: T & Store<T>): StoreToRefs<T>;

declare global {
    function defineStore<T>(id: string, setup: () => T): () => T & Store<T>;
}

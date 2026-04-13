export function defineStore<T>(id: string, setup: () => T): () => T;
export function resetStore(id: string): void;
export function clearStores(): void;
export function registerStorePlugin(plugin: (store: any, id: string) => void): void;

declare global {
    function defineStore<T>(id: string, setup: () => T): () => T;
}

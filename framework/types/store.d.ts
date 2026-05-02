export type MutationType = 'direct' | 'patch object' | 'patch function';

export const MutationType: {
    readonly DIRECT: 'direct';
    readonly PATCH_OBJECT: 'patch object';
    readonly PATCH_FUNCTION: 'patch function';
};

export interface StoreMutation {
    type: MutationType;
    storeId: string;
    payload?: Record<string, any>;
}

export interface SubscribeOptions {
    flush?: 'pre' | 'post' | 'sync';
    detached?: boolean;
}

export type SubscribeCallback = (mutation: StoreMutation, state: any) => void;
export type UnsubscribeFunction = () => void;

export interface Store<T> {
    readonly id: string;
    readonly type: 'store';
    patch(partial: Partial<{ [K in keyof T]: T[K] extends (...args: any[]) => any ? ReturnType<T[K]> : T[K] }> | ((state: T) => void)): void;
    subscribe(callback: SubscribeCallback, options?: SubscribeOptions): UnsubscribeFunction;
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
    type MutationType = import('./store').MutationType;
}

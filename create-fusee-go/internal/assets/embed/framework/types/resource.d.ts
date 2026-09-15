import { SignalAccessor } from './signal'

export interface ResourceHandle<T> {
    data: SignalAccessor<T | undefined>
    loading: SignalAccessor<boolean>
    error: SignalAccessor<any>
}

export type ResourceFetcher<T, Args extends any[]> = (...args: Args) => Promise<T> | T

export interface ResourceHook<T, Args extends any[]> {
    (...args: Args): ResourceHandle<T>
    _resourceKey: string
    _cache: Map<string, any>
}

export interface DefineResourceOptions<Args extends any[]> {
    key?: (...args: Args) => string
}

export declare function defineResource<T, Args extends any[] = any[]>(resourceKey: string,fetcher: ResourceFetcher<T, Args>,opts?: DefineResourceOptions<Args>): ResourceHook<T, Args>
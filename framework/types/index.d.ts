export * from './signal'
export * from './component'
export * from './composable'
export * from './router'
export * from './compiler'
export * from './directives'
export * from './store'
export * from './event-delegation'
export * from './di'
export * from './reconcile'
export * from './actions'
export * from './actions.server'

declare global {
    type Signal<T = any> = import('./signal').Signal<T>
    type Computed<T = any> = import('./signal').Computed<T>
    type SignalAccessor<T> = import('./signal').SignalAccessor<T>
    type Composable<T extends (...args: any[]) => any> = import('./composable').Composable<T>
    type DirectiveBinding<V = any> = import('./directives').DirectiveBinding<V>
    type DirectiveHooks<V = any> = import('./directives').DirectiveHooks<V>
    type DelegatedEventOptions = import('./event-delegation').DelegatedEventOptions
    const defineStore: typeof import('./store').defineStore
    const storeToRefs: typeof import('./store').storeToRefs
    const storeToState: typeof import('./store').storeToState
    const storeToGetters: typeof import('./store').storeToGetters
    const useNestedStore: typeof import('./store').useNestedStore
    type StoreHook<T> = import('./store').StoreHook<T>
    const isDelegatedEvent: typeof import('./event-delegation').isDelegatedEvent
    const InjectionToken: typeof import('./di').InjectionToken
    const provideGlobal: typeof import('./di').provideGlobal
    const reconcile: typeof import('./reconcile').reconcile
}

export as namespace Fusee

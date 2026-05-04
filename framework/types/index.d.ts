export * from './signal'
export * from './component'
export * from './composable'
export * from './router'
export * from './compiler'
export * from './directives'
export * from './store'
export * from './event-delegation'

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
    const isDelegatedEvent: typeof import('./event-delegation').isDelegatedEvent
}

export as namespace Fusee

export * from './signal'
export * from './component'
export * from './composable'
export * from './router'
export * from './compiler'
export * from './directives'

declare global {
    type Signal<T = any> = import('./signal').Signal<T>
    type Computed<T = any> = import('./signal').Computed<T>
    type SignalAccessor<T> = import('./signal').SignalAccessor<T>
    type Composable<T extends (...args: any[]) => any> = import('./composable').Composable<T>
    type DirectiveBinding<V = any> = import('./directives').DirectiveBinding<V>
    type DirectiveHooks<V = any> = import('./directives').DirectiveHooks<V>
}

export as namespace Fusee

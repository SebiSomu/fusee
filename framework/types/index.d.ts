export * from './signal'
export * from './component'
export * from './composable'
export * from './router'
export * from './compiler'

declare global {
    type Signal<T = any>          = import('./signal').Signal<T>
    type Computed<T = any>        = import('./signal').Computed<T>
    type SignalAccessor<T>        = import('./signal').SignalAccessor<T>
    type Composable<T extends (...args: any[]) => any> = import('./composable').Composable<T>
}

export as namespace Fusee

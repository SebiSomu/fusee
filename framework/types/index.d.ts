// ─── Fusée Framework Types ───────────────────────────────────────────────────

// Public API
export * from './signal'
export * from './component'
export * from './router'
export * from './compiler'

declare global {
    type Signal<T = any> = import('./signal').Signal<T>
    type Computed<T = any> = import('./signal').Computed<T>
    type SignalAccessor<T> = import('./signal').SignalAccessor<T>
}

// Re-export as namespace for convenience
export as namespace Fusee

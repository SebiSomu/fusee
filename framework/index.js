// ─── Framework Public API ─────────────────────────────────────────────────────
export { signal, computed, effect, batch, untrack } from './core/signal.js'
export { defineComponent, onMount, onUnmount } from './core/component.js'
export { createRouter, navigate, mountOutlet } from './router/router.js'
export { mountTemplate } from './core/compiler.js'

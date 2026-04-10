// ─── Framework Public API ─────────────────────────────────────────────────────
export { signal, computed, effect, batch, untrack, inspect } from './core/signal.js'
export { defineComponent, defineAsyncComponent, onMount, onUnmount, parseSlots, provide, inject } from './core/component.js'
export { createRouter, navigate, mountOutlet } from './router/router.js'
export { mountTemplate } from './core/compiler.js'

// Emit is a placeholder - actual emit function is created per component
export const emit = () => console.warn('[framework] emit() can only be used inside component setup()')

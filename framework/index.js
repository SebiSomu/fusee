// ─── Framework Public API ─────────────────────────────────────────────────────
export { signal, computed, effect, batch, untrack, inspect } from './core/signal.js'
export { defineComponent, defineAsyncComponent, onMount, onUnmount, parseSlots, provide, inject, getCurrentInstance } from './core/component.js'
export { createRouter, navigate, mountOutlet } from './router/router.js'
export { mountTemplate } from './core/compiler.js'

export { defineComposable, assertSetupContext } from './core/composable.js'
export { directive } from './core/directives.js'

export const emit = () => console.warn('[framework] emit() can only be used inside component setup()')

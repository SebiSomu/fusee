// ─── Framework Public API ─────────────────────────────────────────────────────
export { signal, computed, effect, batch, untrack, inspect, watch, onCleanup, resource, createSuspense, scheduleAsyncJob } from './core/signal.js'
export { defineComponent, defineAsyncComponent, onMount, onUnmount, parseSlots, provide, inject, getCurrentInstance } from './core/component.js'
export { InjectionToken, provideGlobal } from './core/di.js'
export { createRouter, navigate, mountOutlet, currentRoute, routeParams, routeQuery, matchedRoutes } from './router/router.js'
export { generateRoutes } from './router/file-router.js'
export { mountTemplate } from './core/compiler.js'
export { defineComposable, assertSetupContext } from './core/composable.js'
export { defineStore, resetStore, clearStores, registerStorePlugin, storeToRefs, storeToState, storeToGetters, useNestedStore, MutationType } from './core/store.js'
export { directive } from './core/directives.js'
export { reconcile } from './core/reconcile.js'
export const emit = () => console.warn('[framework] emit() can only be used inside component setup()')

// ─── Framework Public API ─────────────────────────────────────────────────────
// Exports only, with no side effects, so bundlers keep just what an app uses.
// To expose the API on globalThis instead, import 'fusee-framework/globals'.

export const emit = () => console.warn('[framework] emit() can only be used inside component setup()')

export { signal, computed, effect, batch, untrack, inspect, watch, onCleanup, resource, createSuspense, scheduleAsyncJob } from './core/signal.js'
export { defineResource } from './core/resource.js'
export { defineComponent } from './core/component.js'
export { defineCompiledComponent, defineAsyncComponent, onMount, onUnmount, parseSlots, provide, inject, getCurrentInstance } from './core/component-core.js'
export { defineElement, toCustomElement, css, unsafeCSS } from './core/element.js'
export { InjectionToken, provideGlobal } from './core/di.js'
export { createRouter, navigate, mountOutlet, currentRoute, routeParams, routeQuery, matchedRoutes } from './router/router.js'
export { generateRoutes } from './router/file-router.js'
export { mountTemplate } from './core/compiler.js'
export { defineComposable, assertSetupContext } from './core/composable.js'
export { defineStore, resetStore, clearStores, registerStorePlugin, storeToRefs, storeToState, storeToGetters, useNestedStore, MutationType } from './core/store.js'
export { directive } from './core/directives.js'
export { reconcile } from './core/reconcile.js'
export { defineAction, createActionProxy, useAction } from './server/actions.js'
export { createApp } from './core/app-registry.js'
export { defineCompilerPlugin, defineServerPlugin, defineDevToolsPlugin, defineRuntimeAdapter, defineFuseePlugin } from './core/plugins.js'

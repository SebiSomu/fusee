// ─── Framework Public API (core) ──────────────────────────────────────────────
// Exports only, with no side effects, so bundlers keep just what an app uses.
// To expose the API on globalThis instead, import 'fusee-framework/globals'.
//
// Everything else ships as its own entry point:
//   fusee-framework/router   createRouter, navigate, generateRoutes, guards, route signals
//   fusee-framework/store    defineStore and store helpers
//   fusee-framework/di       InjectionToken, provideGlobal, root injector
//   fusee-framework/actions  server actions, client side (defineAction, useAction)
//   fusee-framework/plugins  plugin descriptors (defineFuseePlugin, ...)
//   fusee-framework/server   Node: action handling, SSR helpers, manifest
// FREL, Comet and the Go SSR engine are add-ons: `fusee add frel | comet | server`.

export const emit = () => console.warn('[framework] emit() can only be used inside component setup()')

export { signal, computed, effect, batch, untrack, inspect, watch, onCleanup, resource, createSuspense, scheduleAsyncJob } from './core/signal.js'
export { defineResource } from './core/resource.js'
export { defineComponent } from './core/component.js'
export { defineCompiledComponent, defineAsyncComponent, onMount, onUnmount, parseSlots, provide, inject, getCurrentInstance } from './core/component-core.js'
export { defineElement, toCustomElement, css, unsafeCSS } from './core/element.js'
export { mountTemplate } from './core/compiler.js'
export { defineComposable, assertSetupContext } from './core/composable.js'
export { directive } from './core/directives.js'
export { reconcile } from './core/reconcile.js'
export { createApp } from './core/app-registry.js'

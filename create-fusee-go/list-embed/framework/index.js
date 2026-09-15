// ─── Framework Public API ─────────────────────────────────────────────────────
import * as signalModule from './core/signal.js'
import * as resourceModule from './core/resource.js'
import * as componentModule from './core/component.js'
import * as diModule from './core/di.js'
import * as routerModule from './router/router.js'
import * as fileRouterModule from './router/file-router.js'
import * as compilerModule from './core/compiler.js'
import * as composableModule from './core/composable.js'
import * as storeModule from './core/store.js'
import * as directivesModule from './core/directives.js'
import * as reconcileModule from './core/reconcile.js'
import * as actionsModule from './server/actions.js'

export const emit = () => console.warn('[framework] emit() can only be used inside component setup()')

export { signal, computed, effect, batch, untrack, inspect, watch, onCleanup, resource, createSuspense, scheduleAsyncJob } from './core/signal.js'
export { defineResource } from './core/resource.js'
export { defineComponent, defineAsyncComponent, onMount, onUnmount, parseSlots, provide, inject, getCurrentInstance } from './core/component.js'
export { InjectionToken, provideGlobal } from './core/di.js'
export { createRouter, navigate, mountOutlet, currentRoute, routeParams, routeQuery, matchedRoutes } from './router/router.js'
export { generateRoutes } from './router/file-router.js'
export { mountTemplate } from './core/compiler.js'
export { defineComposable, assertSetupContext } from './core/composable.js'
export { defineStore, resetStore, clearStores, registerStorePlugin, storeToRefs, storeToState, storeToGetters, useNestedStore, MutationType } from './core/store.js'
export { directive } from './core/directives.js'
export { reconcile } from './core/reconcile.js'
export { defineAction, createActionProxy, useAction } from './server/actions.js'

if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, {
        ...signalModule,
        ...resourceModule,
        ...componentModule,
        ...diModule,
        ...routerModule,
        ...fileRouterModule,
        ...compilerModule,
        ...composableModule,
        ...storeModule,
        ...directivesModule,
        ...reconcileModule,
        ...actionsModule,
        emit
    })
}


import { App, createApp as createAppFn } from './app-registry'

export * from './signal'
export * from './component'
export * from './composable'
export * from './router'
export * from './compiler'
export * from './directives'
export * from './store'
export * from './event-delegation'
export * from './di'
export * from './reconcile'
export * from './resource'
export * from './actions'
export * from './actions.server'
export * from './plugins'
export * from './app-registry'
export * from '../core/comet-js/comet'
export * from '../core/comet-js/comet-fusee'

declare global {
    type Signal<T = any> = import('./signal').Signal<T>
    type Computed<T = any> = import('./signal').Computed<T>
    type SignalAccessor<T> = import('./signal').SignalAccessor<T>
    type Composable<T extends (...args: any[]) => any> = import('./composable').Composable<T>
    type DirectiveBinding<V = any> = import('./directives').DirectiveBinding<V>
    type DirectiveHooks<V = any> = import('./directives').DirectiveHooks<V>
    type DelegatedEventOptions = import('./event-delegation').DelegatedEventOptions

    type AppConfig = import('./app-registry').AppConfig
    type Plugin<Options extends any[] = any[]> = import('./app-registry').Plugin<Options>
    type CompilerPlugin = import('./plugins').CompilerPlugin
    type ServerPlugin = import('./plugins').ServerPlugin
    type DevToolsPlugin = import('./plugins').DevToolsPlugin
    type RuntimeAdapter = import('./plugins').RuntimeAdapter
    type FuseePlugin = import('./plugins').FuseePlugin

    const App: typeof import('./app-registry').App
    const createApp: typeof createAppFn

    const defineCompilerPlugin: typeof import('./plugins').defineCompilerPlugin
    const defineServerPlugin: typeof import('./plugins').defineServerPlugin
    const defineDevToolsPlugin: typeof import('./plugins').defineDevToolsPlugin
    const defineRuntimeAdapter: typeof import('./plugins').defineRuntimeAdapter
    const defineFuseePlugin: typeof import('./plugins').defineFuseePlugin

    const emit: (eventName?: string, ...args: any[]) => void
    const signal: typeof import('./signal').signal
    const computed: typeof import('./signal').computed
    const effect: typeof import('./signal').effect
    const batch: typeof import('./signal').batch
    const untrack: typeof import('./signal').untrack
    const inspect: typeof import('./signal').inspect
    const watch: typeof import('./signal').watch
    const onCleanup: typeof import('./signal').onCleanup
    const resource: typeof import('./signal').resource
    const defineResource: typeof import('./resource').defineResource
    const createSuspense: typeof import('./signal').createSuspense
    const scheduleAsyncJob: typeof import('./signal').scheduleAsyncJob

    const defineComponent: typeof import('./component').defineComponent
    const defineAsyncComponent: typeof import('./component').defineAsyncComponent
    const onMount: typeof import('./component').onMount
    const onUnmount: typeof import('./component').onUnmount
    const parseSlots: typeof import('./component').parseSlots
    const provide: typeof import('./component').provide
    const inject: typeof import('./di').inject
    const getCurrentInstance: typeof import('./component').getCurrentInstance

    const createRouter: typeof import('./router').createRouter
    const navigate: typeof import('./router').navigate
    const mountOutlet: typeof import('./router').mountOutlet
    const currentRoute: typeof import('./router').currentRoute
    const routeParams: typeof import('./router').routeParams
    const routeQuery: typeof import('./router').routeQuery
    const matchedRoutes: typeof import('./router').matchedRoutes
    const routeMeta: typeof import('./router').routeMeta
    const beforeEach: typeof import('./router').beforeEach
    const afterEach: typeof import('./router').afterEach
    const use: typeof import('./router').use
    const onError: typeof import('./router').onError
    const generateRoutes: typeof import('./router').generateRoutes

    const mountTemplate: typeof import('./compiler').mountTemplate
    const defineComposable: typeof import('./composable').defineComposable
    const assertSetupContext: typeof import('./composable').assertSetupContext

    const defineStore: typeof import('./store').defineStore
    const storeToRefs: typeof import('./store').storeToRefs
    const storeToState: typeof import('./store').storeToState
    const storeToGetters: typeof import('./store').storeToGetters
    const useNestedStore: typeof import('./store').useNestedStore
    const resetStore: typeof import('./store').resetStore
    const clearStores: typeof import('./store').clearStores
    const registerStorePlugin: typeof import('./store').registerStorePlugin
    type StoreHook<T> = import('./store').StoreHook<T>

    const directive: typeof import('./directives').directive
    const isDelegatedEvent: typeof import('./event-delegation').isDelegatedEvent
    const InjectionToken: typeof import('./di').InjectionToken
    const provideGlobal: typeof import('./di').provideGlobal
    const reconcile: typeof import('./reconcile').reconcile

    const defineAction: typeof import('./actions').defineAction
    const createActionProxy: typeof import('./actions').createActionProxy
    const useAction: typeof import('./actions').useAction
}

export as namespace Fusee

declare module '*.template.html' {
    export const render: (_ctx: any, _components: any) => any[]
}
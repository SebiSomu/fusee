// Auto-import preset for unplugin-auto-import: every public name, mapped to the entry
// point that exports it. Add-ons (FREL, Comet) are not auto-imported; import them explicitly.
export const FuseePreset = {
    'fusee-framework': [
        'signal', 'computed', 'effect', 'watch',
        'batch', 'untrack', 'inspect', 'onCleanup', 'resource', 'defineResource',
        'createSuspense', 'scheduleAsyncJob',
        'defineComponent', 'defineCompiledComponent', 'defineAsyncComponent', 'onMount', 'onUnmount', 'parseSlots',
        'defineElement', 'toCustomElement', 'css', 'unsafeCSS',
        'directive', 'reconcile', 'mountTemplate', 'emit',
        'provide', 'inject', 'getCurrentInstance',
        'defineComposable', 'assertSetupContext',
        'createApp'
    ],
    'fusee-framework/router': [
        'createRouter', 'navigate', 'mountOutlet', 'currentRoute', 'routeParams', 'routeQuery',
        'matchedRoutes', 'routeMeta', 'generateRoutes', 'beforeEach', 'afterEach'
    ],
    'fusee-framework/store': [
        'defineStore', 'resetStore', 'clearStores', 'registerStorePlugin', 'storeToRefs',
        'storeToState', 'storeToGetters', 'useNestedStore', 'MutationType'
    ],
    'fusee-framework/di': [
        'InjectionToken', 'provideGlobal'
    ],
    'fusee-framework/actions': [
        'defineAction', 'createActionProxy', 'useAction'
    ],
    'fusee-framework/plugins': [
        'defineCompilerPlugin', 'defineServerPlugin', 'defineDevToolsPlugin', 'defineRuntimeAdapter',
        'defineFuseePlugin'
    ]
}

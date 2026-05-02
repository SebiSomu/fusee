import { getCurrentInstance, setCurrentInstance } from './component.js'
import { batch, effect } from './signal.js'


const storesRegistry = new Map()
const storePlugins = []

export const MutationType = {
    DIRECT: 'direct',
    PATCH_OBJECT: 'patch object',
    PATCH_FUNCTION: 'patch function'
}

export function registerStorePlugin(plugin) {
    if (typeof plugin === 'function') {
        storePlugins.push(plugin)
    }
}

const isDev = typeof import.meta.env !== 'undefined' ? !!import.meta.env.DEV : true
if (isDev && typeof window !== 'undefined') {
    window.__FRAMEWORK_STORES__ = storesRegistry
}

export function defineStore(id, setup) {
    if (typeof id !== 'string' || !id.trim()) {
        console.error('[framework] defineStore requires a valid string ID.')
    }

    function useStore() {
        let store = storesRegistry.get(id)

        if (!store) {
            const prevInstance = getCurrentInstance()

            setCurrentInstance(null)

            try {
                store = setup()

                if (store instanceof Promise) {
                    console.error(`[framework] Store "${id}" cannot be async.`)
                    throw new Error(`Async store "${id}" is not supported.`)
                }

            } catch (err) {
                console.error(`[framework] Error initializing store "${id}":`, err)
                throw err
            } finally {
                setCurrentInstance(prevInstance)
            }

            const initialState = {}
            const signalKeys = []
            for (const key in store) {
                if (typeof store[key] === 'function' && store[key].isSignal && !store[key].readonly) {
                    initialState[key] = store[key]()
                    signalKeys.push(key)
                }
            }

            // Subscription management
            const subscriptions = new Map()
            let subscriptionId = 0
            let currentMutation = null

            function notifySubscribers() {
                if (!currentMutation) return
                const mutation = currentMutation
                currentMutation = null

                const state = {}
                for (const key of signalKeys) {
                    state[key] = store[key]()
                }

                for (const [subId, sub] of subscriptions) {
                    if (sub.flush === 'sync') {
                        sub.callback(mutation, state)
                    } else {
                        // Default: post (after all batched updates)
                        queueMicrotask(() => {
                            if (subscriptions.has(subId)) {
                                sub.callback(mutation, state)
                            }
                        })
                    }
                }
            }

            function wrapSignal(key, originalSignal) {
                const wrapped = function(newValue) {
                    if (arguments.length === 0) {
                        return originalSignal()
                    } else {
                        const result = originalSignal(newValue)
                        if (!currentMutation) {
                            currentMutation = {
                                type: MutationType.DIRECT,
                                storeId: id,
                                payload: { [key]: newValue }
                            }
                            notifySubscribers()
                        }
                        return result
                    }
                }
                wrapped.isSignal = true
                for (const method of ['map', 'filter', 'slice', 'concat', 'flat', 'flatMap',
                                      'find', 'findLast', 'findIndex', 'findLastIndex',
                                      'indexOf', 'lastIndexOf', 'includes', 'every', 'some',
                                      'reduce', 'at', 'join', 'push', 'pop', 'shift', 'unshift',
                                      'splice', 'remove', 'clear', 'sort', 'reverse']) {
                    if (originalSignal[method]) {
                        wrapped[method] = originalSignal[method]
                    }
                }
                return wrapped
            }

            const wrappedSignals = {}
            for (const key of signalKeys) {
                wrappedSignals[key] = wrapSignal(key, store[key])
                store[key] = wrappedSignals[key]
            }

            Object.defineProperties(store, {
                id: {
                    value: id,
                    enumerable: false
                },
                type: {
                    value: 'store',
                    enumerable: false
                },
                patch: {
                    value: (arg) => {
                        const isObjectPatch = arg && typeof arg === 'object'
                        currentMutation = {
                            type: isObjectPatch ? MutationType.PATCH_OBJECT : MutationType.PATCH_FUNCTION,
                            storeId: id,
                            payload: isObjectPatch ? { ...arg } : undefined
                        }

                        batch(() => {
                            if (typeof arg === 'function') {
                                arg(store)
                            } else if (isObjectPatch) {
                                for (const key in arg) {
                                    if (typeof store[key] === 'function' && store[key].isSignal && !store[key].readonly) {
                                        const originalSignal = wrappedSignals[key]
                                        originalSignal(arg[key])
                                    }
                                }
                            }
                        })

                        notifySubscribers()
                    },
                    enumerable: false
                },
                reset: {
                    value: () => {
                        currentMutation = {
                            type: MutationType.PATCH_FUNCTION,
                            storeId: id,
                            payload: undefined
                        }

                        batch(() => {
                            for (const key in initialState) {
                                const originalSignal = wrappedSignals[key]
                                originalSignal(initialState[key])
                            }
                        })

                        notifySubscribers()
                    },
                    enumerable: false
                },
                subscribe: {
                    value: (callback, options = {}) => {
                        if (typeof callback !== 'function') {
                            console.warn('[framework] subscribe callback must be a function')
                            return () => {}
                        }

                        const subId = ++subscriptionId
                        const sub = {
                            callback,
                            flush: options.flush || 'post',
                            detached: options.detached || false
                        }
                        subscriptions.set(subId, sub)

                        if (!sub.detached) {
                            const instance = getCurrentInstance()
                            if (instance && instance._unmountHooks) {
                                instance._unmountHooks.push(() => {
                                    subscriptions.delete(subId)
                                })
                            }
                        }

                        return () => {
                            subscriptions.delete(subId)
                        }
                    },
                    enumerable: false
                }
            })

            for (const plugin of storePlugins) {
                try {
                    plugin(store, id)
                } catch (e) {
                    console.warn(`[framework] Store plugin error for "${id}":`, e)
                }
            }

            storesRegistry.set(id, store)
        }

        return store
    }

    useStore.$id = id

    return useStore
}

export function resetStore(id) {
    storesRegistry.delete(id)
}

export function clearStores() {
    storesRegistry.clear()
}

export function storeToRefs(store) {
    const refs = {}
    for (const key in store) {
        const value = store[key]
        if (typeof value === 'function' && value.isSignal) {
            refs[key] = value
        }
    }
    return refs
}

import { getCurrentInstance, setCurrentInstance } from './component.js'
import { batch } from './signal.js'


const storesRegistry = new Map()
const storePlugins = []

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
            for (const key in store) {
                if (typeof store[key] === 'function' && store[key].isSignal && !store[key].readonly) {
                    initialState[key] = store[key]()
                }
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
                        batch(() => {
                            if (typeof arg === 'function') {
                                arg(store)
                            } else if (arg && typeof arg === 'object') {
                                for (const key in arg) {
                                    if (typeof store[key] === 'function' && store[key].isSignal && !store[key].readonly) {
                                        store[key](arg[key])
                                    }
                                }
                            }
                        })
                    },
                    enumerable: false
                },
                reset: {
                    value: () => {
                        batch(() => {
                            for (const key in initialState) {
                                store[key](initialState[key])
                            }
                        })
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

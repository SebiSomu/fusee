import { signal } from './signal.js'
import { getInFlightStore } from './async-context.js'
import { _registerResourceCache } from './hydration.js'

export function defineResource(resourceKey, fetcher, opts = {}) {
    const cache = new Map()
    const deriveKey = opts.key ?? ((...args) => JSON.stringify(args))

    function useResource(...args) {
        const cacheKey = deriveKey(...args)
        const flightKey = `${resourceKey}:${cacheKey}`
        const store = getInFlightStore()

        const data = signal(undefined)
        const loading = signal(true)
        const error = signal(undefined)

        _registerResourceCache(resourceKey, cache)

        const existing = cache.get(cacheKey)

        if (existing?.status === 'resolved') {
            data(existing.data)
            loading(false)
            return { data, loading, error }
        }

        if (existing?.status === 'rejected') {
            error(existing.error)
            loading(false)
            return { data, loading, error }
        }

        if (existing?.status === 'pending') {
            store.byKey.set(flightKey, existing.promise)
            return { data, loading, error }
        }

        let promise = store.byKey.get(flightKey)
        if (!promise) {
            promise = Promise.resolve(fetcher(...args))
                .then(result => {
                    cache.set(cacheKey, { status: 'resolved', data: result, updatedAt: Date.now() })
                    return result
                })
                .catch(err => {
                    cache.set(cacheKey, { status: 'rejected', error: err, updatedAt: Date.now() })
                    throw err
                })
            cache.set(cacheKey, { status: 'pending', promise })
            store.byKey.set(flightKey, promise)
        }

        return { data, loading, error }
    }

    useResource._resourceKey = resourceKey
    useResource._cache = cache
    return useResource
}
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineResource } from '../core/resource.js'
import { renderPageSSR } from '../server/ssr-render.js'
import { extractHydrationData } from '../core/hydration.js'
import { getInFlightStore, isSSRContext } from '../core/async-context.js'

function delay(ms, value) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms))
}

describe('defineResource / useResource', () => {
    it('resolves data through the signal-shaped {data, loading, error} API', async () => {
        const fetcher = vi.fn(async (id) => ({ id, name: `item-${id}` }))
        const useItem = defineResource('item', fetcher)

        const result = await renderPageSSR(async () => {
            const { data, loading } = useItem(42)
            return { data: data(), loading: loading() }
        })

        expect(result.data).toEqual({ id: 42, name: 'item-42' })
        expect(result.loading).toBe(false)
        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('dedupes concurrent calls for the same key within one pass (fetcher runs once)', async () => {
        const fetcher = vi.fn(async (id) => delay(5, { id }))
        const useItem = defineResource('item-dedup', fetcher)

        await renderPageSSR(async () => {
            // Two call sites, same request, same pass, same key.
            const a = useItem(1)
            const b = useItem(1)
            return { a: a.data(), b: b.data() }
        })

        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('does not refetch on a later pass once a key has resolved (cache hit is synchronous)', async () => {
        const fetcher = vi.fn(async (id) => ({ id }))
        const useItem = defineResource('item-cache-hit', fetcher)
        let passCount = 0

        const result = await renderPageSSR(async () => {
            passCount++
            const { data, loading } = useItem(7)
            return { data: data(), loading: loading() }
        })

        // First pass: fetch kicked off, loading() is true at call time.
        // Second pass: cache already resolved -> synchronous hit.
        expect(passCount).toBe(2)
        expect(result.loading).toBe(false)
        expect(result.data).toEqual({ id: 7 })
        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('propagates fetcher rejection through the error signal without throwing out of the pass', async () => {
        const boom = new Error('upstream failed')
        const fetcher = vi.fn(async () => { throw boom })
        const useItem = defineResource('item-error', fetcher)

        const result = await renderPageSSR(async () => {
            const { data, error, loading } = useItem('x')
            return { data: data(), error: error(), loading: loading() }
        })

        expect(result.error).toBe(boom)
        expect(result.data).toBeUndefined()
        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('registers resolved data into the request-scoped hydration snapshot', async () => {
        const useItem = defineResource('item-hydrate', async (id) => ({ id, ok: true }))

        let snapshot
        await renderPageSSR(async () => {
            const { data } = useItem(99)
            snapshot = extractHydrationData()
            return data()
        })

        expect(snapshot['item-hydrate']).toBeDefined()
        expect(snapshot['item-hydrate']['[99]']).toEqual(
            expect.objectContaining({ data: { id: 99, ok: true } })
        )
    })
})

describe('renderPageSSR suspense loop', () => {
    it('runs additional passes only while resources are pending, then stops', async () => {
        const useSlow = defineResource('slow', async () => delay(10, 'done'))
        let passes = 0

        const result = await renderPageSSR(async () => {
            passes++
            const { data, loading } = useSlow()
            return loading() ? null : data()
        })

        expect(result).toBe('done')
        expect(passes).toBe(2)
    })

    it('bails out after maxPasses and warns, rather than looping forever', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // A resource whose fetcher itself calls another (uncached) fetch each time —
        // pathological, but should be bounded by maxPasses, not hang the test.
        let counter = 0
        const useNever = defineResource('never-settles', async () => {
            counter++
            return delay(1, `v${counter}`)
        }, { key: () => String(Math.random()) }) // force a new cache key every call -> never converges

        const result = await renderPageSSR(async () => {
            const { data, loading } = useNever()
            return loading() ? 'pending' : data()
        }, { maxPasses: 3 })

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('exceeded 3 suspense passes'))
        warn.mockRestore()
    })

    it('exposes isSSRContext() as true only inside the request scope', async () => {
        expect(isSSRContext()).toBe(false)

        let insideValue
        await renderPageSSR(async () => {
            insideValue = isSSRContext()
            return null
        })

        expect(insideValue).toBe(true)
        expect(isSSRContext()).toBe(false)
    })
})

describe('per-request isolation (the actual Step 2 requirement)', () => {
    it('never lets one concurrent request see another request\'s in-flight state', async () => {
        // Same resourceKey, but each "user" fetches a DIFFERENT key (their own id) —
        // this is the realistic case: per-user data must key on something request-specific.
        const fetchLog = []
        const useUserProfile = defineResource('user-profile', async (userId) => {
            fetchLog.push(`fetch:${userId}`)
            // Stagger resolution so request B's pass finishes before request A's,
            // proving they don't trip over each other's inFlightMaps.
            const delayMs = userId === 'A' ? 20 : 5
            await delay(delayMs)
            return { userId, secret: `secret-for-${userId}` }
        })

        function runForUser(userId) {
            return renderPageSSR(async () => {
                const store = getInFlightStore()
                const { data, loading } = useUserProfile(userId)
                return { userId, data: data(), loading: loading(), storeRef: store }
            })
        }

        const [resultA, resultB] = await Promise.all([
            runForUser('A'),
            runForUser('B'),
        ])

        expect(resultA.data).toEqual({ userId: 'A', secret: 'secret-for-A' })
        expect(resultB.data).toEqual({ userId: 'B', secret: 'secret-for-B' })
        // Distinct inFlightMaps stores per request — not the same object.
        expect(resultA.storeRef).not.toBe(resultB.storeRef)
        // Each user's data fetched exactly once, never cross-served.
        expect(fetchLog).toEqual(expect.arrayContaining(['fetch:A', 'fetch:B']))
        expect(fetchLog.filter(l => l === 'fetch:A')).toHaveLength(1)
        expect(fetchLog.filter(l => l === 'fetch:B')).toHaveLength(1)
    })

    it('shares a resolved cache entry across requests when keys genuinely coincide (by design, not a leak)', async () => {
        // This documents the deliberate behavior: the resolved-value cache
        // is a keyed data cache, not per-request storage. Same resourceKey
        // + same derived cacheKey => same cached data, across requests —
        // exactly like any shared server-side cache. Isolation guarantees
        // apply to PENDING work (inFlightMaps), not to refusing legitimate
        // cache reuse.
        const fetcher = vi.fn(async (productId) => ({ productId, price: 10 }))
        const useProduct = defineResource('product-shared', fetcher)

        await renderPageSSR(async () => {
            useProduct(1)
        })
        await renderPageSSR(async () => {
            useProduct(1)
        })

        expect(fetcher).toHaveBeenCalledTimes(1) // second request got a cache hit
    })
})
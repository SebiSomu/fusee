import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
    _registerALS,
    _globalInFlightMaps,
    getInFlightStore,
    isSSRContext
} from '../core/async-context.js'

let testALS

function createRequestContext() {
    return {
        inFlightMaps: {
            byKey: new Map(),
            byFetcher: new WeakMap()
        }
    }
}

function withRequestContext(ctx, fn) {
    return testALS.run(ctx, fn)
}

beforeEach(() => {
    testALS = new AsyncLocalStorage()
    _registerALS(testALS)
    _globalInFlightMaps.byKey.clear()
})

afterEach(() => {
    _registerALS(null)
})

function deferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

describe('async-context', () => {

    it('without SSR context -> returns shared globals (browser mode)', () => {
        _registerALS(null)
        const store = getInFlightStore()
        expect(store).toBe(_globalInFlightMaps)
    })

    it('isSSRContext() returns false in browser mode', () => {
        _registerALS(null)
        expect(isSSRContext()).toBe(false)
    })

    it('two parallel contexts isolate byKey Maps', () => {
        const ctx1 = createRequestContext()
        const ctx2 = createRequestContext()
        expect(ctx1.inFlightMaps.byKey).not.toBe(ctx2.inFlightMaps.byKey)
    })

    it('withRequestContext propagates context through await', async () => {
        const ctx = createRequestContext()
        const key = 'test-key'
        const fakePromise = Promise.resolve('value')

        await withRequestContext(ctx, async () => {
            getInFlightStore().byKey.set(key, fakePromise)
            await Promise.resolve()
            expect(getInFlightStore().byKey.get(key)).toBe(fakePromise)
        })
    })

    it('isSSRContext() returns true inside withRequestContext', async () => {
        const ctx = createRequestContext()
        await withRequestContext(ctx, async () => {
            expect(isSSRContext()).toBe(true)
        })
    })

    it('isSSRContext() returns false outside withRequestContext', async () => {
        const ctx = createRequestContext()
        await withRequestContext(ctx, async () => {
            expect(isSSRContext()).toBe(true)
        })
        expect(isSSRContext()).toBe(false)
    })

    it('two parallel contexts do not mix in-flight promises', async () => {
        const ctx1 = createRequestContext()
        const ctx2 = createRequestContext()
        const d1 = deferred()
        const d2 = deferred()
        const key = 'shared-key'

        const p1 = withRequestContext(ctx1, async () => {
            getInFlightStore().byKey.set(key, d1.promise)
            await new Promise(r => setTimeout(r, 5))
            return { ref: getInFlightStore().byKey.get(key) }
        })

        const p2 = withRequestContext(ctx2, async () => {
            getInFlightStore().byKey.set(key, d2.promise)
            await new Promise(r => setTimeout(r, 5))
            return { ref: getInFlightStore().byKey.get(key) }
        })

        d1.resolve('result-1')
        d2.resolve('result-2')

        const [result1, result2] = await Promise.all([p1, p2])

        expect(result1.ref).toBe(d1.promise)
        expect(result2.ref).toBe(d2.promise)
        expect(result1.ref).not.toBe(result2.ref)
    })

    it('withRequestContext returns the value of fn() directly (sync)', () => {
        const ctx = createRequestContext()
        expect(withRequestContext(ctx, () => 42)).toBe(42)
    })

    it('withRequestContext returns a Promise if fn() is async', async () => {
        const ctx = createRequestContext()
        const result = withRequestContext(ctx, async () => 'async-value')
        expect(result).toBeInstanceOf(Promise)
        expect(await result).toBe('async-value')
    })

    it('resource() does not mix in-flight promises between different contexts', async () => {
        const ctx1 = createRequestContext()
        const ctx2 = createRequestContext()
        const key = 'user-1'

        let storeInCtx1 = null
        let storeInCtx2 = null

        await withRequestContext(ctx1, async () => {
            storeInCtx1 = getInFlightStore()
            storeInCtx1.byKey.set(key, Promise.resolve('user-from-ctx1'))
        })

        await withRequestContext(ctx2, async () => {
            storeInCtx2 = getInFlightStore()
            expect(storeInCtx2.byKey.has(key)).toBe(false)
        })

        expect(storeInCtx1).not.toBe(storeInCtx2)
        expect(storeInCtx1.byKey.has(key)).toBe(true)
        expect(storeInCtx2.byKey.has(key)).toBe(false)
    })
})
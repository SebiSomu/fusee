import { describe, it, expect, vi } from 'vitest'
import { defineStore, storeToRefs, MutationType } from '../core/store.js'
import { signal, effect } from '../core/signal.js'

describe('store', () => {

    it('defineStore returns a hook that creates/returns a store', () => {
        const useStore = defineStore('test-1', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        expect(store.id).toBe('test-1')
        expect(store.type).toBe('store')
        expect(typeof store.patch).toBe('function')
        expect(store.count()).toBe(0)
    })

    it('id and type are non-enumerable', () => {
        const useStore = defineStore('test-2', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const keys = Object.keys(store)
        expect(keys).not.toContain('id')
        expect(keys).not.toContain('type')
        expect(keys).not.toContain('patch')
        expect(keys).toContain('count')
    })

    it('patch(object) updates multiple signals', () => {
        const useStore = defineStore('test-3', () => {
            const name = signal('Guest')
            const age = signal(20)
            return { name, age }
        })

        const store = useStore()
        store.patch({ name: 'DIO', age: 120 })

        expect(store.name()).toBe('DIO')
        expect(store.age()).toBe(120)
    })

    it('patch(function) updates multiple signals', () => {
        const useStore = defineStore('test-4', () => {
            const count = signal(0)
            const items = signal([])
            return { count, items }
        })

        const store = useStore()
        store.patch((state) => {
            state.count(state.count() + 1)
            state.items.push('item1')
        })

        expect(store.count()).toBe(1)
        expect(store.items()).toEqual(['item1'])
    })

    it('patch batches updates', () => {
        const useStore = defineStore('test-5', () => {
            const a = signal(1)
            const b = signal(2)
            return { a, b }
        })

        const store = useStore()
        const spy = vi.fn()

        effect(() => {
            spy(store.a() + store.b())
        })

        expect(spy).toHaveBeenCalledTimes(1)

        store.patch({ a: 10, b: 20 })

        // Should only trigger once after patch completes
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(30)
    })

    it('patch ignores non-existent or readonly properties', () => {
        const useStore = defineStore('test-6', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        // Should not throw or crash
        store.patch({ count: 5, unknown: 'value', id: 'new-id' })

        expect(store.count()).toBe(5)
        expect(store.id).toBe('test-6') // id remains constant
    })

    it('reset restores all signals to initial values', () => {
        const useStore = defineStore('test-7', () => {
            const count = signal(0)
            const name = signal('initial')
            const items = signal([1, 2, 3])
            return { count, name, items }
        })

        const store = useStore()
        expect(typeof store.reset).toBe('function')

        // Modify state
        store.count(10)
        store.name('modified')
        store.items([4, 5, 6])

        expect(store.count()).toBe(10)
        expect(store.name()).toBe('modified')
        expect(store.items()).toEqual([4, 5, 6])

        // Reset
        store.reset()

        expect(store.count()).toBe(0)
        expect(store.name()).toBe('initial')
        expect(store.items()).toEqual([1, 2, 3])
    })

    it('reset is non-enumerable', () => {
        const useStore = defineStore('test-8', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const keys = Object.keys(store)
        expect(keys).not.toContain('reset')
    })

    it('reset batches updates', () => {
        const useStore = defineStore('test-9', () => {
            const a = signal(1)
            const b = signal(2)
            return { a, b }
        })

        const store = useStore()
        const spy = vi.fn()

        effect(() => {
            spy(store.a() + store.b())
        })

        expect(spy).toHaveBeenCalledTimes(1)

        store.a(10)
        store.b(20)

        expect(spy).toHaveBeenCalledTimes(3)

        // Reset should trigger only once
        store.reset()

        expect(spy).toHaveBeenCalledTimes(4)
        expect(spy).toHaveBeenLastCalledWith(3)
    })

    it('storeToRefs extracts only signal properties', () => {
        const useStore = defineStore('test-10', () => {
            const count = signal(0)
            const name = signal('test')
            const increment = () => count(count() + 1)
            return { count, name, increment }
        })

        const store = useStore()
        const refs = storeToRefs(store)

        // Should only have signals
        expect(Object.keys(refs)).toContain('count')
        expect(Object.keys(refs)).toContain('name')
        expect(Object.keys(refs)).not.toContain('increment')

        // Values should be the signal functions
        expect(refs.count).toBe(store.count)
        expect(refs.name).toBe(store.name)
    })

    it('storeToRefs maintains reactivity when destructured', () => {
        const useStore = defineStore('test-11', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const { count } = storeToRefs(store)

        const spy = vi.fn()
        effect(() => {
            spy(count())
        })

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenLastCalledWith(0)

        // Update through destructured ref
        count(5)
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(5)

        // Update through original store
        store.count(10)
        expect(spy).toHaveBeenCalledTimes(3)
        expect(spy).toHaveBeenLastCalledWith(10)
    })

    it('storeToRefs excludes store built-in properties', () => {
        const useStore = defineStore('test-12', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const refs = storeToRefs(store)

        // Should not include store built-ins
        expect(Object.keys(refs)).not.toContain('id')
        expect(Object.keys(refs)).not.toContain('type')
        expect(Object.keys(refs)).not.toContain('patch')
        expect(Object.keys(refs)).not.toContain('reset')
    })

    // ─── $subscribe Tests ───────────────────────────────────────────────────────

    it('subscribe is available on store', () => {
        const useStore = defineStore('test-sub-1', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        expect(typeof store.subscribe).toBe('function')
    })

    it('subscribe returns unsubscribe function', () => {
        const useStore = defineStore('test-sub-2', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const unsubscribe = store.subscribe(() => {})
        expect(typeof unsubscribe).toBe('function')
    })

    it('subscribe detects direct mutations', async () => {
        const useStore = defineStore('test-sub-3', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const spy = vi.fn()

        store.subscribe(spy)
        store.count(5)

        // Wait for microtask
        await new Promise(r => queueMicrotask(r))

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                type: 'direct',
                storeId: 'test-sub-3',
                payload: { count: 5 }
            }),
            expect.objectContaining({ count: 5 })
        )
    })

    it('subscribe detects patch object mutations', async () => {
        const useStore = defineStore('test-sub-4', () => {
            const name = signal('John')
            const age = signal(25)
            return { name, age }
        })

        const store = useStore()
        const spy = vi.fn()

        store.subscribe(spy)
        store.patch({ name: 'Jane', age: 30 })

        // Wait for microtask
        await new Promise(r => queueMicrotask(r))

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                type: 'patch object',
                storeId: 'test-sub-4',
                payload: { name: 'Jane', age: 30 }
            }),
            expect.objectContaining({ name: 'Jane', age: 30 })
        )
    })

    it('subscribe detects patch function mutations', async () => {
        const useStore = defineStore('test-sub-5', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const spy = vi.fn()

        store.subscribe(spy)
        store.patch(state => {
            state.count(state.count() + 1)
        })

        // Wait for microtask
        await new Promise(r => queueMicrotask(r))

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                type: 'patch function',
                storeId: 'test-sub-5',
                payload: undefined
            }),
            expect.objectContaining({ count: 1 })
        )
    })

    it('subscribe with flush: sync triggers immediately', () => {
        const useStore = defineStore('test-sub-6', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const spy = vi.fn()

        store.subscribe(spy, { flush: 'sync' })
        store.count(5)

        // Should be called immediately, no async
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                type: 'direct',
                storeId: 'test-sub-6'
            }),
            expect.objectContaining({ count: 5 })
        )
    })

    it('unsubscribe function stops callbacks', async () => {
        const useStore = defineStore('test-sub-7', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const spy = vi.fn()

        const unsubscribe = store.subscribe(spy)
        store.count(1)
        await new Promise(r => queueMicrotask(r))
        expect(spy).toHaveBeenCalledTimes(1)

        unsubscribe()
        store.count(2)
        await new Promise(r => queueMicrotask(r))
        expect(spy).toHaveBeenCalledTimes(1) // Should not increase
    })

    it('patch triggers only one subscription callback', async () => {
        const useStore = defineStore('test-sub-8', () => {
            const a = signal(1)
            const b = signal(2)
            return { a, b }
        })

        const store = useStore()
        const spy = vi.fn()

        store.subscribe(spy)
        store.patch({ a: 10, b: 20 })

        await new Promise(r => queueMicrotask(r))

        // Should only trigger once for the patch, not for each signal
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('id is accessible on store', () => {
        const useStore = defineStore('test-sub-9', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        expect(store.id).toBe('test-sub-9')
    })

    it('MutationType constants are exported', () => {
        expect(MutationType.DIRECT).toBe('direct')
        expect(MutationType.PATCH_OBJECT).toBe('patch object')
        expect(MutationType.PATCH_FUNCTION).toBe('patch function')
    })

    it('reset triggers subscription with patch function type', async () => {
        const useStore = defineStore('test-sub-10', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const spy = vi.fn()

        store.count(10)
        await new Promise(r => queueMicrotask(r))

        store.subscribe(spy)
        store.reset()

        await new Promise(r => queueMicrotask(r))

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                type: 'patch function',
                storeId: 'test-sub-10'
            }),
            expect.objectContaining({ count: 0 })
        )
    })

    it('subscribe is non-enumerable', () => {
        const useStore = defineStore('test-sub-11', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        const keys = Object.keys(store)
        expect(keys).not.toContain('subscribe')
    })

})

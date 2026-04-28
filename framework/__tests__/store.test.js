import { describe, it, expect, vi } from 'vitest'
import { defineStore } from '../core/store.js'
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

})

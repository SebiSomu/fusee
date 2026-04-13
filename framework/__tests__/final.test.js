// stress.test.js
import { describe, it, expect, vi } from 'vitest'
import { signal, effect, batch, computed } from '../core/signal.js'
import { defineComponent, provide, inject, defineAsyncComponent } from '../core/component.js'

describe('Fusée Stress & Edge Cases', () => {

    it('Memory Leak Check: effects should not persist after unmount', () => {
        const count = signal(0)
        let effectRuns = 0

        const Comp = defineComponent({
            setup() {
                effect(() => {
                    count()
                    effectRuns++
                })
                return { template: '<div></div>' }
            }
        })

        const container = document.createElement('div')
        const { render, unmount } = Comp()
        render(container)

        count(1)
        unmount()

        count(2) 
        expect(effectRuns).toBe(2)
    })

    it('Dependency Injection: Shadowing', () => {
        const Grandparent = defineComponent({
            setup() { provide('key', 'GP'); return { template: '...' } }
        })
        const Parent = defineComponent({
            setup() { provide('key', 'P'); return { template: '...' } }
        })
        const Child = defineComponent({
            setup() { return { val: inject('key'), template: '...' } }
        })

        const gp = Grandparent().instance
        const p = Parent({}, { parent: gp }).instance
        const cApi = Child({}, { parent: p })
        
        expect(cApi.instance.state.val).toBe('P')
    })

    it('Reactivity Cycle Detection: should prevent infinite loops in effects', () => {
        const count = signal(0)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
        
        effect(() => {
            count(count() + 1)
        })

        expect(count()).toBe(1)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Recursive effect detected'))
        warnSpy.mockRestore()
    })

    it('Circular Dependency Detection: should prevent infinite loops in computed', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
        
        const a = computed(() => b() + 1)
        const b = computed(() => a() + 1)

        // Calling a() would normally cause infinite recursion
        // Now it should return the cached value (NaN or undefined initially) and warn
        const result = a()
        
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Circular dependency detected'))
        warnSpy.mockRestore()
    })

    it('Async Component: Race Condition check', async () => {
        let resolveLoader
        const loader = () => new Promise(res => { resolveLoader = res })
        
        const InnerComp = defineComponent({
            setup: () => ({ template: '<div id="loaded"></div>' })
        })

        const AsyncComp = defineAsyncComponent({ loader })
        const container = document.createElement('div')
        const { render, unmount } = AsyncComp()
        
        render(container)
        unmount() // Unmount before loader finishes

        resolveLoader({ default: InnerComp })
        await new Promise(r => setTimeout(r, 0))

        expect(container.querySelector('#loaded')).toBeNull()
    })

    it('Concurrent Updates: multiple stores updating same signal in a batch', () => {
        const globalValue = signal(0)
        const spy = vi.fn()
        effect(() => spy(globalValue()))

        batch(() => {
            globalValue(globalValue() + 1)
            globalValue(globalValue() + 2)
        })

        expect(globalValue()).toBe(3)
        expect(spy).toHaveBeenCalledTimes(2) // 1 initial + 1 after batch flush
    })
})

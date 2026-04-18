// stress.test.js
import { describe, it, expect, vi } from 'vitest'
import { signal, effect, batch, computed, onCleanup } from '../core/signal.js'
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

    it('Memory Leak Check: multiple effects should be cleaned up', () => {
        const count = signal(0)
        const effectRuns = [0, 0, 0]

        const Comp = defineComponent({
            setup() {
                effect(() => {
                    count()
                    effectRuns[0]++
                })
                effect(() => {
                    count()
                    effectRuns[1]++
                })
                effect(() => {
                    count()
                    effectRuns[2]++
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
        expect(effectRuns[0]).toBe(2)
        expect(effectRuns[1]).toBe(2)
        expect(effectRuns[2]).toBe(2)
    })

    it('Memory Leak Check: signals should not leak after component unmount', () => {
        const cleanupSpy = vi.fn()

        const Comp = defineComponent({
            setup() {
                const count = signal(0)
                effect(() => {
                    count()
                    onCleanup(cleanupSpy)
                })
                return { template: '<div></div>' }
            }
        })

        const container = document.createElement('div')
        const { render, unmount } = Comp()
        render(container)

        unmount()
        expect(cleanupSpy).toHaveBeenCalled()
    })

    it('Memory Leak Check: nested effects should cleanup with parent', () => {
        const parentCount = signal(0)
        const childCount = signal(0)
        let parentRuns = 0
        let childRuns = 0

        const Comp = defineComponent({
            setup() {
                effect(() => {
                    parentCount()
                    parentRuns++

                    // Nested effect
                    effect(() => {
                        childCount()
                        childRuns++
                    })
                })
                return { template: '<div></div>' }
            }
        })

        const container = document.createElement('div')
        const { render, unmount } = Comp()
        render(container)

        // Both should have run once
        expect(parentRuns).toBe(1)
        expect(childRuns).toBe(1)

        // Update child signal
        childCount(1)
        expect(childRuns).toBe(2) // child re-runs
        expect(parentRuns).toBe(1) // parent doesn't re-run

        // Unmount should cleanup both
        unmount()

        // After unmount, neither should run
        parentCount(1)
        childCount(2)
        expect(parentRuns).toBe(1) // still 1
        expect(childRuns).toBe(2) // still 2
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

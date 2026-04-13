import { describe, it, expect, vi } from 'vitest'
import {
    signal,
    effect,
    computed,
    batch,
    untrack,
    watch,
    watchEffect
} from '../core/signal.js'

// ─────────────────────────────────────────────
// EFFECT
// ─────────────────────────────────────────────

describe('effect()', () => {

    it('runs immediately on creation', () => {
        const count = signal(0)
        const spy = vi.fn()

        effect(() => {
            spy(count())
        })

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(0)
    })

    it('reruns when signal changes', () => {
        const count = signal(0)
        const spy = vi.fn()

        effect(() => spy(count()))

        count(1)
        count(2)

        expect(spy).toHaveBeenCalledTimes(3)
        expect(spy).toHaveBeenNthCalledWith(1, 0)
        expect(spy).toHaveBeenNthCalledWith(2, 1)
        expect(spy).toHaveBeenNthCalledWith(3, 2)
    })

    it('does NOT rerun if value is the same (Object.is)', () => {
        const count = signal(5)
        const spy = vi.fn()

        effect(() => spy(count()))

        count(5) // same value
        count(5)

        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('stops tracking after cleanup is called', () => {
        const count = signal(0)
        const spy = vi.fn()

        const stop = effect(() => spy(count()))

        stop()
        count(1)
        count(2)

        expect(spy).toHaveBeenCalledTimes(1) // only initial run
    })

    it('cleans up deps correctly after stop', () => {
        const a = signal(1)
        const b = signal(2)
        const spy = vi.fn()

        const stop = effect(() => spy(a() + b()))

        stop()

        a(10)
        b(20)

        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('dynamically tracks only accessed signals', () => {
        const toggle = signal(true)
        const a = signal('A')
        const b = signal('B')
        const spy = vi.fn()

        effect(() => {
            spy(toggle() ? a() : b())
        })

        // Initial: reads toggle + a
        expect(spy).toHaveBeenCalledTimes(1)

        b('B2') // not tracked yet
        expect(spy).toHaveBeenCalledTimes(1)

        toggle(false) // now reads toggle + b
        expect(spy).toHaveBeenCalledTimes(2)

        a('A2') // no longer tracked
        expect(spy).toHaveBeenCalledTimes(2)

        b('B3') // now tracked
        expect(spy).toHaveBeenCalledTimes(3)
    })

    it('handles nested effects correctly', () => {
        const outer = signal(0)
        const inner = signal(0)
        const outerSpy = vi.fn()
        const innerSpy = vi.fn()

        effect(() => {
            outerSpy(outer())
            effect(() => {
                innerSpy(inner())
            })
        })

        inner(1)
        expect(innerSpy).toHaveBeenCalledTimes(2)

        outer(1)
        // outer reruns, creates new inner effect
        expect(outerSpy).toHaveBeenCalledTimes(2)
    })

    it('does not track signals read inside untrack()', () => {
        const a = signal(1)
        const b = signal(10)
        const spy = vi.fn()

        effect(() => {
            const aVal = a()
            const bVal = untrack(() => b())
            spy(aVal + bVal)
        })

        expect(spy).toHaveBeenCalledTimes(1)

        b(99) // should NOT trigger rerun
        expect(spy).toHaveBeenCalledTimes(1)

        a(2) // should trigger rerun
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(2 + 99)
    })

    it('batches multiple signal updates into one effect run', () => {
        const a = signal(1)
        const b = signal(2)
        const spy = vi.fn()

        effect(() => spy(a() + b()))

        expect(spy).toHaveBeenCalledTimes(1)

        batch(() => {
            a(10)
            b(20)
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(30)
    })

    it('nested batch flushes only at outermost level', () => {
        const count = signal(0)
        const spy = vi.fn()

        effect(() => spy(count()))

        batch(() => {
            batch(() => {
                count(1)
                count(2)
            })
            count(3)
            // still inside outer batch, should not flush yet
            expect(spy).toHaveBeenCalledTimes(1)
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(3)
    })

    it('does not run stopped effect even if queued in batch', () => {
        const count = signal(0)
        const spy = vi.fn()

        const stop = effect(() => spy(count()))

        batch(() => {
            count(1)
            stop() // stop while inside batch
        })

        expect(spy).toHaveBeenCalledTimes(1) // only initial run
    })

})

// ─────────────────────────────────────────────
// COMPUTED
// ─────────────────────────────────────────────

describe('computed()', () => {

    it('returns derived value', () => {
        const count = signal(3)
        const doubled = computed(() => count() * 2)

        expect(doubled()).toBe(6)
    })

    it('is lazy — does not compute until read', () => {
        const count = signal(0)
        const spy = vi.fn(() => count() * 2)
        const doubled = computed(spy)

        expect(spy).not.toHaveBeenCalled()

        doubled()
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('caches value — does not recompute if deps unchanged', () => {
        const count = signal(5)
        const spy = vi.fn(() => count() * 2)
        const doubled = computed(spy)

        doubled()
        doubled()
        doubled()

        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('recomputes when dependency changes', () => {
        const count = signal(1)
        const doubled = computed(() => count() * 2)

        expect(doubled()).toBe(2)

        count(5)
        expect(doubled()).toBe(10)
    })

    it('is read-only — warns on write attempt', () => {
        const count = signal(0)
        const doubled = computed(() => count() * 2)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        doubled(99)

        expect(warn).toHaveBeenCalledWith('[framework] computed() is read-only')
        warn.mockRestore()
    })

    it('chains computed values correctly', () => {
        const base = signal(2)
        const doubled = computed(() => base() * 2)
        const quadrupled = computed(() => doubled() * 2)

        expect(quadrupled()).toBe(8)

        base(3)
        expect(quadrupled()).toBe(12)
    })

    it('computed inside effect reruns correctly', () => {
        const count = signal(1)
        const doubled = computed(() => count() * 2)
        const spy = vi.fn()

        effect(() => spy(doubled()))

        expect(spy).toHaveBeenCalledWith(2)

        count(5)
        expect(spy).toHaveBeenCalledWith(10)
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it('does not notify downstream if computed value is unchanged', () => {
        const a = signal(2)
        const b = signal(3)
        // computed depends on both but always returns same value
        const alwaysFive = computed(() => {
            a(); b()
            return 5
        })
        const spy = vi.fn()

        effect(() => spy(alwaysFive()))

        expect(spy).toHaveBeenCalledTimes(1)

        a(10) // triggers recompute, but value stays 5
        expect(spy).toHaveBeenCalledTimes(1) // should NOT rerun effect
    })

    it('disposes correctly — stops tracking after dispose()', () => {
        const count = signal(0)
        const spy = vi.fn(() => count() * 2)
        const doubled = computed(spy)

        doubled() // initial compute
        expect(spy).toHaveBeenCalledTimes(1)

        doubled.dispose()

        count(99) // should not trigger recompute
        doubled()
        // after dispose, deps are cleared — will recompute once on next read
        // but won't be subscribed to count anymore
        expect(spy).toHaveBeenCalledTimes(2)

        count(100)
        doubled()
        // still not subscribed, so dirty stays false after first read post-dispose
        // behavior depends on implementation — at minimum it should not crash
        expect(typeof doubled()).toBe('number')
    })

    it('handles computed depending on multiple signals', () => {
        const first = signal('John')
        const last = signal('Doe')
        const full = computed(() => `${first()} ${last()}`)

        expect(full()).toBe('John Doe')

        first('Jane')
        expect(full()).toBe('Jane Doe')

        last('Smith')
        expect(full()).toBe('Jane Smith')
    })

    it('computed chain — middle node invalidates correctly', () => {
        const a = signal(1)
        const b = computed(() => a() + 1)   // 2
        const c = computed(() => b() * 10)  // 20
        const spy = vi.fn()

        effect(() => spy(c()))

        expect(spy).toHaveBeenCalledWith(20)

        a(2) // b = 3, c = 30
        expect(spy).toHaveBeenCalledWith(30)
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it('computed with conditional dependency switching', () => {
        const toggle = signal(true)
        const a = signal(100)
        const b = signal(200)
        const spy = vi.fn()

        const result = computed(() => toggle() ? a() : b())

        effect(() => spy(result()))

        expect(spy).toHaveBeenCalledWith(100)

        b(999) // not tracked
        expect(spy).toHaveBeenCalledTimes(1)

        toggle(false)
        expect(spy).toHaveBeenCalledWith(999)

        a(999) // no longer tracked
        expect(spy).toHaveBeenCalledTimes(2)

        b(300)
        expect(spy).toHaveBeenCalledWith(300)
        expect(spy).toHaveBeenCalledTimes(3)
    })

})

// ─────────────────────────────────────────────
// EFFECT + COMPUTED COMBINED
// ─────────────────────────────────────────────

describe('effect() + computed() combined', () => {

    it('effect does not rerun if computed value is same', () => {
        const x = signal(1)
        const isPositive = computed(() => x() > 0)
        const spy = vi.fn()

        effect(() => spy(isPositive()))

        x(2)  // still positive
        x(10) // still positive

        expect(spy).toHaveBeenCalledTimes(1) // only initial
    })

    it('multiple effects on same computed', () => {
        const count = signal(0)
        const doubled = computed(() => count() * 2)
        const spy1 = vi.fn()
        const spy2 = vi.fn()

        effect(() => spy1(doubled()))
        effect(() => spy2(doubled()))

        count(5)

        expect(spy1).toHaveBeenLastCalledWith(10)
        expect(spy2).toHaveBeenLastCalledWith(10)
        expect(spy1).toHaveBeenCalledTimes(2)
        expect(spy2).toHaveBeenCalledTimes(2)
    })

    it('stopping one effect does not affect others on same computed', () => {
        const count = signal(0)
        const doubled = computed(() => count() * 2)
        const spy1 = vi.fn()
        const spy2 = vi.fn()

        const stop1 = effect(() => spy1(doubled()))
        effect(() => spy2(doubled()))

        stop1()
        count(5)

        expect(spy1).toHaveBeenCalledTimes(1) // stopped
        expect(spy2).toHaveBeenCalledTimes(2) // still running
    })

    it('deep chain: signal → computed → computed → effect', () => {
        const price = signal(100)
        const withTax = computed(() => price() * 1.2)
        const formatted = computed(() => `€${withTax().toFixed(2)}`)
        const spy = vi.fn()

        effect(() => spy(formatted()))

        expect(spy).toHaveBeenCalledWith('€120.00')

        price(200)
        expect(spy).toHaveBeenCalledWith('€240.00')
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it('batch with computed — effect runs once with final value', () => {
        const a = signal(1)
        const b = signal(2)
        const sum = computed(() => a() + b())
        const spy = vi.fn()

        effect(() => spy(sum()))

        batch(() => {
            a(10)
            b(20)
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(30)
    })

    it('untrack inside computed prevents extra subscriptions', () => {
        const a = signal(1)
        const b = signal(100)
        const spy = vi.fn()

        const result = computed(() => {
            const aVal = a()
            const bVal = untrack(() => b())
            return aVal + bVal
        })

        effect(() => spy(result()))

        b(999) // should NOT trigger recompute
        expect(spy).toHaveBeenCalledTimes(1)

        a(2) // should trigger
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(2 + 999)
    })

    it('effect cleanup runs before next execution', () => {
        const count = signal(0)
        const cleanupSpy = vi.fn()
        const effectSpy = vi.fn()

        // Testam cu watchEffect care suporta onCleanup
        watchEffect((onCleanup) => {
            effectSpy(count())
            onCleanup(() => cleanupSpy())
        })

        count(1)
        expect(cleanupSpy).toHaveBeenCalledTimes(1) // cleanup before rerun

        count(2)
        expect(cleanupSpy).toHaveBeenCalledTimes(2)
        expect(effectSpy).toHaveBeenCalledTimes(3) // initial + 2 reruns
    })

})

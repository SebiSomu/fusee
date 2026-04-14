import { describe, it, expect, vi } from 'vitest'
import {
    signal,
    effect,
    computed,
    batch,
    untrack,
    watch,
    inspect,
    setEffectHook
} from '../core/signal.js'

// ─────────────────────────────────────────────
// SIGNAL
// ─────────────────────────────────────────────

describe('signal()', () => {

    it('returns initial value', () => {
        const count = signal(42)
        expect(count()).toBe(42)
    })

    it('updates value when called with argument', () => {
        const count = signal(0)
        count(10)
        expect(count()).toBe(10)
    })

    it('does not update if same value (Object.is)', () => {
        const count = signal(5)
        const spy = vi.fn()
        effect(() => { spy(count()) })

        count(5)
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('handles NaN correctly (Object.is NaN === NaN)', () => {
        const val = signal(NaN)
        const spy = vi.fn()
        effect(() => spy(val()))

        val(NaN) // same NaN, should NOT trigger
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('handles null and undefined', () => {
        const val = signal(null)
        val(undefined)
        expect(val()).toBeUndefined()
        val(null)
        expect(val()).toBeNull()
    })

    it('has isSignal flag', () => {
        const s = signal(0)
        expect(s.isSignal).toBe(true)
    })

    it('notifies multiple subscribers', () => {
        const count = signal(0)
        const spy1 = vi.fn()
        const spy2 = vi.fn()

        effect(() => spy1(count()))
        effect(() => spy2(count()))

        count(1)
        expect(spy1).toHaveBeenLastCalledWith(1)
        expect(spy2).toHaveBeenLastCalledWith(1)
    })

    // ── Array signal ──

    it('array signal — has mutating methods', () => {
        const list = signal([1, 2, 3])
        expect(typeof list.push).toBe('function')
        expect(typeof list.pop).toBe('function')
        expect(typeof list.shift).toBe('function')
        expect(typeof list.unshift).toBe('function')
        expect(typeof list.splice).toBe('function')
        expect(typeof list.remove).toBe('function')
        expect(typeof list.clear).toBe('function')
        expect(typeof list.sort).toBe('function')
        expect(typeof list.reverse).toBe('function')
    })

    it('array signal — push adds items and triggers reactivity', () => {
        const list = signal([1, 2])
        const spy = vi.fn()
        effect(() => spy(list().length))

        list.push(3, 4)
        expect(list()).toEqual([1, 2, 3, 4])
        expect(spy).toHaveBeenLastCalledWith(4)
    })

    it('array signal — pop removes last item', () => {
        const list = signal([1, 2, 3])
        const removed = list.pop()
        expect(removed).toBe(3)
        expect(list()).toEqual([1, 2])
    })

    it('array signal — pop on empty returns undefined', () => {
        const list = signal([])
        expect(list.pop()).toBeUndefined()
    })

    it('array signal — shift removes first item', () => {
        const list = signal([10, 20, 30])
        const removed = list.shift()
        expect(removed).toBe(10)
        expect(list()).toEqual([20, 30])
    })

    it('array signal — unshift prepends items', () => {
        const list = signal([3, 4])
        list.unshift(1, 2)
        expect(list()).toEqual([1, 2, 3, 4])
    })

    it('array signal — splice removes and inserts', () => {
        const list = signal([1, 2, 3, 4, 5])
        const removed = list.splice(1, 2, 10, 20)
        expect(removed).toEqual([2, 3])
        expect(list()).toEqual([1, 10, 20, 4, 5])
    })

    it('array signal — remove by predicate', () => {
        const list = signal([1, 2, 3, 4, 5])
        list.remove(x => x % 2 === 0)
        expect(list()).toEqual([1, 3, 5])
    })

    it('array signal — clear empties the array', () => {
        const list = signal([1, 2, 3])
        list.clear()
        expect(list()).toEqual([])
    })

    it('array signal — sort sorts correctly', () => {
        const list = signal([3, 1, 2])
        list.sort((a, b) => a - b)
        expect(list()).toEqual([1, 2, 3])
    })

    it('array signal — reverse reverses correctly', () => {
        const list = signal([1, 2, 3])
        list.reverse()
        expect(list()).toEqual([3, 2, 1])
    })

    it('array signal — reactive map returns computed', () => {
        const list = signal([1, 2, 3])
        const doubled = list.map(x => x * 2)

        expect(doubled()).toEqual([2, 4, 6])

        list.push(4)
        expect(doubled()).toEqual([2, 4, 6, 8])
    })

    it('array signal — reactive filter returns computed', () => {
        const list = signal([1, 2, 3, 4, 5])
        const evens = list.filter(x => x % 2 === 0)

        expect(evens()).toEqual([2, 4])

        list.push(6)
        expect(evens()).toEqual([2, 4, 6])
    })

    it('array signal — find returns computed', () => {
        const list = signal([1, 2, 3])
        const found = list.find(x => x > 1)
        expect(found()).toBe(2)
    })

    it('array signal — includes returns computed', () => {
        const list = signal([1, 2, 3])
        const has2 = list.includes(2)
        expect(has2()).toBe(true)
    })

    it('array signal — some returns computed', () => {
        const list = signal([1, 2, 3])
        const hasEven = list.some(x => x % 2 === 0)
        expect(hasEven()).toBe(true)
    })

    it('array signal — every returns computed', () => {
        const list = signal([2, 4, 6])
        const allEven = list.every(x => x % 2 === 0)
        expect(allEven()).toBe(true)
    })

    it('array signal — reduce returns computed', () => {
        const list = signal([1, 2, 3, 4])
        const sum = list.reduce((acc, x) => acc + x, 0)
        expect(sum()).toBe(10)
    })

    it('array signal — at returns computed', () => {
        const list = signal([10, 20, 30])
        const last = list.at(-1)
        expect(last()).toBe(30)
    })

    it('array signal — join returns computed', () => {
        const list = signal(['a', 'b', 'c'])
        const joined = list.join('-')
        expect(joined()).toBe('a-b-c')
    })

    it('array signal — slice returns computed', () => {
        const list = signal([1, 2, 3, 4, 5])
        const sliced = list.slice(1, 3)
        expect(sliced()).toEqual([2, 3])
    })

    it('array signal — flat returns computed', () => {
        const list = signal([[1, 2], [3, 4]])
        const flat = list.flat()
        expect(flat()).toEqual([1, 2, 3, 4])
    })

    it('array signal — flatMap returns computed', () => {
        const list = signal([1, 2, 3])
        const result = list.flatMap(x => [x, x * 2])
        expect(result()).toEqual([1, 2, 2, 4, 3, 6])
    })

    it('non-array signal does NOT have mutating methods', () => {
        const s = signal(0)
        expect(s.push).toBeUndefined()
        expect(s.pop).toBeUndefined()
    })

    it('non-array signal still has reactive array methods (graceful null handling)', () => {
        const s = signal(null)
        const mapped = s.map(x => x)
        expect(mapped()).toEqual([])
    })

})

// ─────────────────────────────────────────────
// BATCH
// ─────────────────────────────────────────────

describe('batch()', () => {

    it('coalesces multiple signal updates into one effect run', () => {
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

    it('returns the return value of the callback', () => {
        const result = batch(() => 42)
        expect(result).toBe(42)
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
            expect(spy).toHaveBeenCalledTimes(1) // not flushed yet
            count(3)
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(3)
    })

    it('multiple signals in batch — each effect runs once', () => {
        const x = signal(0)
        const y = signal(0)
        const z = signal(0)
        const spy = vi.fn()

        effect(() => spy(x() + y() + z()))

        batch(() => {
            x(1)
            y(2)
            z(3)
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(6)
    })

    it('batch with computed — effect sees final computed value', () => {
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

    it('stopped effect inside batch does not run after flush', () => {
        const count = signal(0)
        const spy = vi.fn()

        const stop = effect(() => spy(count()))

        batch(() => {
            count(1)
            stop()
        })

        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('batch handles exceptions and still flushes', () => {
        const count = signal(0)
        const spy = vi.fn()

        effect(() => spy(count()))

        try {
            batch(() => {
                count(5)
                throw new Error('oops')
            })
        } catch (_) {}

        // After exception, batchDepth should be 0 and flush should happen
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(5)
    })

})

// ─────────────────────────────────────────────
// UNTRACK
// ─────────────────────────────────────────────

describe('untrack()', () => {

    it('returns the value of the callback', () => {
        const result = untrack(() => 42)
        expect(result).toBe(42)
    })

    it('prevents signal reads from being tracked', () => {
        const a = signal(1)
        const b = signal(10)
        const spy = vi.fn()

        effect(() => {
            const aVal = a()
            const bVal = untrack(() => b())
            spy(aVal + bVal)
        })

        b(99) // not tracked
        expect(spy).toHaveBeenCalledTimes(1)

        a(2) // tracked
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(2 + 99)
    })

    it('restores tracking context after untrack', () => {
        const a = signal(1)
        const b = signal(10)
        const c = signal(100)
        const spy = vi.fn()

        effect(() => {
            a()
            untrack(() => b())
            c() // should be tracked again
            spy()
        })

        b(99) // not tracked
        expect(spy).toHaveBeenCalledTimes(1)

        c(200) // tracked
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it('works correctly inside computed', () => {
        const a = signal(1)
        const b = signal(100)

        const result = computed(() => {
            return a() + untrack(() => b())
        })

        expect(result()).toBe(101)

        b(999)
        expect(result()).toBe(101) // b not tracked, no recompute

        a(2)
        expect(result()).toBe(2 + 999) // recomputes with latest b
    })

    it('nested untrack works correctly', () => {
        const a = signal(1)
        const spy = vi.fn()

        effect(() => {
            untrack(() => {
                untrack(() => {
                    a() // deeply untracked
                })
            })
            spy()
        })

        a(2) // should NOT trigger
        expect(spy).toHaveBeenCalledTimes(1)
    })

})

// ─────────────────────────────────────────────
// WATCH
// ─────────────────────────────────────────────

describe('watch()', () => {

    it('does NOT run callback on init (no immediate)', () => {
        const count = signal(0)
        const spy = vi.fn()

        watch(count, spy)
        expect(spy).not.toHaveBeenCalled()
    })

    it('runs callback with immediate: true', () => {
        const count = signal(5)
        const spy = vi.fn()

        watch(count, spy, { immediate: true })
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(5, undefined, expect.any(Function))
    })

    it('runs callback when signal changes', () => {
        const count = signal(0)
        const spy = vi.fn()

        watch(count, spy)
        count(1)

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(1, 0, expect.any(Function))
    })

    it('provides correct newValue and oldValue', () => {
        const name = signal('Alice')
        const spy = vi.fn()

        watch(name, spy)

        name('Bob')
        expect(spy).toHaveBeenCalledWith('Bob', 'Alice', expect.any(Function))

        name('Charlie')
        expect(spy).toHaveBeenCalledWith('Charlie', 'Bob', expect.any(Function))
    })

    it('does NOT run if value is same (Object.is)', () => {
        const count = signal(5)
        const spy = vi.fn()

        watch(count, spy)
        count(5)

        expect(spy).not.toHaveBeenCalled()
    })

    it('stops watching after stop() is called', () => {
        const count = signal(0)
        const spy = vi.fn()

        const stop = watch(count, spy)
        stop()

        count(1)
        count(2)

        expect(spy).not.toHaveBeenCalled()
    })

    it('supports custom equals function', () => {
        const val = signal({ x: 1 })
        const spy = vi.fn()

        // custom equals: compare by x property
        watch(val, spy, { equals: (a, b) => a?.x === b?.x })

        val({ x: 1 }) // same x, should NOT trigger
        expect(spy).not.toHaveBeenCalled()

        val({ x: 2 }) // different x, should trigger
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('supports getter function as source', () => {
        const a = signal(1)
        const b = signal(2)
        const spy = vi.fn()

        watch(() => a() + b(), spy)

        a(10)
        expect(spy).toHaveBeenCalledWith(12, 3, expect.any(Function))
    })

    it('supports multiple sources as array', () => {
        const a = signal(1)
        const b = signal('hello')
        const spy = vi.fn()

        watch([a, b], spy)

        a(2)
        expect(spy).toHaveBeenCalledWith([2, 'hello'], [1, 'hello'], expect.any(Function))

        b('world')
        expect(spy).toHaveBeenCalledWith([2, 'world'], [2, 'hello'], expect.any(Function))
    })

    it('onCleanup runs before next callback', () => {
        const count = signal(0)
        const cleanupSpy = vi.fn()

        watch(count, (val, old, onCleanup) => {
            onCleanup(() => cleanupSpy())
        })

        count(1) // first run, registers cleanup
        count(2) // should run cleanup before callback

        expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })

    it('onCleanup runs on stop()', () => {
        const count = signal(0)
        const cleanupSpy = vi.fn()

        const stop = watch(count, (val, old, onCleanup) => {
            onCleanup(() => cleanupSpy())
        })

        count(1) // registers cleanup
        stop()   // should run cleanup

        expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })

    it('warns if callback is not a function', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const count = signal(0)

        watch(count, 'not a function')
        expect(warn).toHaveBeenCalledWith('[framework] watch() callback must be a function')

        warn.mockRestore()
    })

    it('warns if source is not a function', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        watch(42, () => {})
        expect(warn).toHaveBeenCalledWith(
            '[framework] watch() source should be a signal, getter, or an array of those'
        )

        warn.mockRestore()
    })

    it('watch with computed as source', () => {
        const count = signal(1)
        const doubled = computed(() => count() * 2)
        const spy = vi.fn()

        watch(doubled, spy)

        count(5)
        expect(spy).toHaveBeenCalledWith(10, 2, expect.any(Function))
    })

    it('immediate + multi-source', () => {
        const a = signal(1)
        const b = signal(2)
        const spy = vi.fn()

        watch([a, b], spy, { immediate: true })

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith([1, 2], undefined, expect.any(Function))
    })

})

// ─────────────────────────────────────────────
// INSPECT
// ─────────────────────────────────────────────

describe('inspect()', () => {

    it('logs signal values on creation', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const count = signal(42)

        inspect(count)
        expect(consoleSpy).toHaveBeenCalledWith('[inspect]', 42)

        consoleSpy.mockRestore()
    })

    it('logs multiple signals', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const a = signal(1)
        const b = signal(2)

        inspect(a, b)
        expect(consoleSpy).toHaveBeenCalledWith('[inspect]', 1, 2)

        consoleSpy.mockRestore()
    })

    it('reruns when signal changes', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const count = signal(0)

        inspect(count)
        count(5)

        expect(consoleSpy).toHaveBeenCalledTimes(2)
        expect(consoleSpy).toHaveBeenLastCalledWith('[inspect]', 5)

        consoleSpy.mockRestore()
    })

    it('logs non-function args as-is', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        inspect('static label', 123)
        expect(consoleSpy).toHaveBeenCalledWith('[inspect]', 'static label', 123)

        consoleSpy.mockRestore()
    })

    it('returns a cleanup function', () => {
        const count = signal(0)
        const stop = inspect(count)
        expect(typeof stop).toBe('function')
    })

    it('stops logging after cleanup is called', () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const count = signal(0)

        const stop = inspect(count)
        stop()

        count(99)
        expect(consoleSpy).toHaveBeenCalledTimes(1) // only initial

        consoleSpy.mockRestore()
    })

})

// ─────────────────────────────────────────────
// SETEFFECTHOOK
// ─────────────────────────────────────────────

describe('setEffectHook()', () => {

    it('calls hook with cleanup when effect is created', () => {
        const hookSpy = vi.fn()
        setEffectHook(hookSpy)

        const count = signal(0)
        effect(() => count())

        expect(hookSpy).toHaveBeenCalledTimes(1)
        expect(typeof hookSpy.mock.calls[0][0]).toBe('function') // cleanup fn

        setEffectHook(null) // reset
    })

    it('hook receives working cleanup function', () => {
        let capturedCleanup = null
        setEffectHook((cleanup) => { capturedCleanup = cleanup })

        const count = signal(0)
        const spy = vi.fn()
        effect(() => spy(count()))

        expect(spy).toHaveBeenCalledTimes(1)

        capturedCleanup() // stop the effect externally
        count(99)

        expect(spy).toHaveBeenCalledTimes(1) // should not rerun

        setEffectHook(null) // reset
    })

    it('hook is called for each new effect', () => {
        const hookSpy = vi.fn()
        setEffectHook(hookSpy)

        const a = signal(0)
        effect(() => a())
        effect(() => a())
        effect(() => a())

        expect(hookSpy).toHaveBeenCalledTimes(3)

        setEffectHook(null) // reset
    })

})

import { describe, it, expect, vi } from 'vitest'
import { from, range, repeat, empty, Enumerable, OrderedEnumerable } from '../frel/frel.js'
import { signal, computed } from '../core/signal.js'

// linq.js only depends on computed() from signal.js, but the framework's real
// signal.js pulls in async-context.js / hydration.js / signal-scope.js, which
// exist elsewhere in the project and aren't needed to exercise FREL's own
// behavior. We mock signal.js with a small, faithful reactive core - lazy
// computed(), synchronous dependency tracking - so these tests stay a true
// unit suite for linq.js while still exercising the real reactivity contract
// (a signal is a function tagged `isSignal`, computed() recomputes lazily on
// dependency change). Swap this mock out for the real module in an
// integration pass once the other files are wired up.
vi.mock('../core/signal.js', () => {
    let currentEffect = null

    function signal(initial) {
        let value = initial
        const subs = new Set()
        function accessor(...args) {
            if (args.length === 0) {
                if (currentEffect) subs.add(currentEffect)
                return value
            }
            value = args[0]
            for (const sub of [...subs]) sub()
            return undefined
        }
        accessor.isSignal = true
        return accessor
    }

    function computed(fn) {
        let value
        let dirty = true
        const recompute = () => {
            dirty = true
            accessor()
        }
        function accessor() {
            if (dirty) {
                const prev = currentEffect
                currentEffect = recompute
                try {
                    value = fn()
                } finally {
                    currentEffect = prev
                    dirty = false
                }
            }
            return value
        }
        accessor.isSignal = true
        return accessor
    }

    return { signal, computed }
})

const people = () => ([
    { name: 'Ana', age: 22, city: 'Brasov' },
    { name: 'Bogdan', age: 31, city: 'Cluj' },
    { name: 'Carmen', age: 22, city: 'Brasov' },
    { name: 'Dan', age: 45, city: 'Cluj' },
    { name: 'Elena', age: 31, city: 'Iasi' }
])

describe('from()', () => {
    it('wraps a plain array', () => {
        expect(from([1, 2, 3]).toArray()).toEqual([1, 2, 3])
    })

    it('wraps a Set and a Map', () => {
        expect(from(new Set([1, 2, 2, 3])).toArray()).toEqual([1, 2, 3])
        expect(from(new Map([['a', 1], ['b', 2]])).toArray()).toEqual([['a', 1], ['b', 2]])
    })

    it('wraps a generator / arbitrary iterable', () => {
        function* gen() { yield 1; yield 2; yield 3 }
        expect(from(gen()).toArray()).toEqual([1, 2, 3])
    })

    it('wraps a plain getter function, re-invoking it on every iteration', () => {
        let backing = [1, 2, 3]
        const getter = () => backing
        const query = from(getter)
        expect(query.toArray()).toEqual([1, 2, 3])
        backing = [9, 9]
        expect(query.toArray()).toEqual([9, 9])
    })

    it('wraps a signal accessor and stays live', () => {
        const list = signal([1, 2, 3])
        const query = from(list)
        expect(query.toArray()).toEqual([1, 2, 3])
        list([4, 5])
        expect(query.toArray()).toEqual([4, 5])
    })

    it('treats null/undefined sources as empty', () => {
        expect(from(null).toArray()).toEqual([])
        expect(from(undefined).toArray()).toEqual([])
    })

    it('treats a getter returning null/undefined as empty', () => {
        expect(from(() => null).toArray()).toEqual([])
    })

    it('returns the same instance when given an Enumerable', () => {
        const q = from([1, 2, 3])
        expect(from(q)).toBe(q)
    })

    it('produces something iterable directly with for...of and spread', () => {
        const q = from([1, 2, 3])
        expect([...q]).toEqual([1, 2, 3])
        const collected = []
        for (const item of q) collected.push(item)
        expect(collected).toEqual([1, 2, 3])
    })
})

describe('laziness / deferred execution', () => {
    it('does not invoke selectors or predicates until the query is iterated', () => {
        const predicate = vi.fn(() => true)
        const selector = vi.fn(x => x)
        const query = from([1, 2, 3]).where(predicate).select(selector)
        expect(predicate).not.toHaveBeenCalled()
        expect(selector).not.toHaveBeenCalled()
        query.toArray()
        expect(predicate).toHaveBeenCalledTimes(3)
        expect(selector).toHaveBeenCalledTimes(3)
    })

    it('re-runs the whole pipeline from the source on every terminal call', () => {
        let n = 0
        const getter = () => { n++; return [1, 2, 3] }
        const query = from(getter).select(x => x * 2)
        query.toArray()
        query.toArray()
        expect(n).toBe(2)
    })

    it('short-circuits take()/first() without draining the whole source', () => {
        const seen = []
        function* infinite() {
            let i = 0
            while (true) { seen.push(i); yield i++ }
        }
        const first3 = from(infinite()).take(3).toArray()
        expect(first3).toEqual([0, 1, 2])
        expect(seen).toEqual([0, 1, 2])
    })
})

describe('where / filter', () => {
    it('filters and passes the index', () => {
        const result = from([10, 20, 30]).where((x, i) => i > 0).toArray()
        expect(result).toEqual([20, 30])
    })

    it('filter() is an alias for where()', () => {
        expect(from([1, 2, 3]).filter(x => x > 1).toArray()).toEqual([2, 3])
    })
})

describe('select / map', () => {
    it('projects each element with its index', () => {
        const result = from(['a', 'b']).select((x, i) => `${i}:${x}`).toArray()
        expect(result).toEqual(['0:a', '1:b'])
    })

    it('map() is an alias for select()', () => {
        expect(from([1, 2]).map(x => x * 10).toArray()).toEqual([10, 20])
    })
})

describe('selectMany / flatMap', () => {
    it('flattens with an identity collection selector', () => {
        const result = from([[1, 2], [3], []]).selectMany(x => x).toArray()
        expect(result).toEqual([1, 2, 3])
    })

    it('applies a result selector combining outer and inner items', () => {
        const orders = [{ id: 1, items: ['a', 'b'] }, { id: 2, items: ['c'] }]
        const result = from(orders)
            .selectMany(o => o.items, (o, item) => `${o.id}-${item}`)
            .toArray()
        expect(result).toEqual(['1-a', '1-b', '2-c'])
    })

    it('flatMap() is an alias for selectMany()', () => {
        expect(from([[1], [2, 3]]).flatMap(x => x).toArray()).toEqual([1, 2, 3])
    })
})

describe('take / takeWhile / skip / skipWhile', () => {
    it('take() handles normal, zero, negative, and oversized counts', () => {
        expect(from([1, 2, 3]).take(2).toArray()).toEqual([1, 2])
        expect(from([1, 2, 3]).take(0).toArray()).toEqual([])
        expect(from([1, 2, 3]).take(-1).toArray()).toEqual([])
        expect(from([1, 2, 3]).take(10).toArray()).toEqual([1, 2, 3])
    })

    it('skip() handles normal, zero, and oversized counts', () => {
        expect(from([1, 2, 3]).skip(1).toArray()).toEqual([2, 3])
        expect(from([1, 2, 3]).skip(0).toArray()).toEqual([1, 2, 3])
        expect(from([1, 2, 3]).skip(10).toArray()).toEqual([])
    })

    it('takeWhile() stops at the first failing predicate', () => {
        expect(from([1, 2, 3, 1]).takeWhile(x => x < 3).toArray()).toEqual([1, 2])
    })

    it('skipWhile() only skips a contiguous leading run', () => {
        expect(from([1, 2, 3, 1]).skipWhile(x => x < 3).toArray()).toEqual([3, 1])
    })
})

describe('distinct', () => {
    it('deduplicates by identity when no key selector is given', () => {
        expect(from([1, 1, 2, 3, 2]).distinct().toArray()).toEqual([1, 2, 3])
    })

    it('deduplicates by a key selector, keeping the first occurrence', () => {
        const items = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }, { id: 2, v: 'c' }]
        expect(from(items).distinct(x => x.id).toArray()).toEqual([{ id: 1, v: 'a' }, { id: 2, v: 'c' }])
    })
})

describe('concat / union / intersect / except', () => {
    it('concat() appends one or more sources in order', () => {
        expect(from([1, 2]).concat([3, 4], [5]).toArray()).toEqual([1, 2, 3, 4, 5])
    })

    it('union() concatenates then dedupes', () => {
        expect(from([1, 2]).union([2, 3]).toArray()).toEqual([1, 2, 3])
    })

    it('intersect() keeps only elements present in both, deduped', () => {
        expect(from([1, 2, 2, 3]).intersect([2, 3, 4]).toArray()).toEqual([2, 3])
    })

    it('except() removes elements present in the other source, deduped', () => {
        expect(from([1, 2, 2, 3]).except([2]).toArray()).toEqual([1, 3])
    })

    it('union/intersect/except accept a key selector', () => {
        const a = [{ id: 1 }, { id: 2 }]
        const b = [{ id: 2 }, { id: 3 }]
        expect(from(a).union(b, x => x.id).toArray().map(x => x.id)).toEqual([1, 2, 3])
        expect(from(a).intersect(b, x => x.id).toArray().map(x => x.id)).toEqual([2])
        expect(from(a).except(b, x => x.id).toArray().map(x => x.id)).toEqual([1])
    })
})

describe('zip', () => {
    it('pairs elements as tuples by default', () => {
        expect(from([1, 2, 3]).zip(['a', 'b', 'c']).toArray()).toEqual([[1, 'a'], [2, 'b'], [3, 'c']])
    })

    it('applies a result selector when given', () => {
        expect(from([1, 2]).zip(['a', 'b'], (n, s) => `${n}${s}`).toArray()).toEqual(['1a', '2b'])
    })

    it('stops at the shorter sequence', () => {
        expect(from([1, 2, 3]).zip(['a']).toArray()).toEqual([[1, 'a']])
    })
})

describe('append / prepend / defaultIfEmpty', () => {
    it('append() adds to the end, prepend() adds to the start', () => {
        expect(from([2, 3]).append(4).toArray()).toEqual([2, 3, 4])
        expect(from([2, 3]).prepend(1).toArray()).toEqual([1, 2, 3])
    })

    it('defaultIfEmpty() only substitutes when the sequence is empty', () => {
        expect(empty().defaultIfEmpty(0).toArray()).toEqual([0])
        expect(from([1]).defaultIfEmpty(0).toArray()).toEqual([1])
        expect(empty().defaultIfEmpty().toArray()).toEqual([null])
    })
})

describe('chunk', () => {
    it('splits into fixed-size chunks with a shorter final chunk', () => {
        expect(range(1, 7).chunk(3).toArray()).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    })

    it('throws for a non-positive size', () => {
        expect(() => from([1]).chunk(0).toArray()).toThrow(/chunk/)
        expect(() => from([1]).chunk(-1).toArray()).toThrow(/chunk/)
    })
})

describe('reverse', () => {
    it('reverses the sequence', () => {
        expect(from([1, 2, 3]).reverse().toArray()).toEqual([3, 2, 1])
    })
})

describe('orderBy / orderByDescending / thenBy / thenByDescending', () => {
    it('sorts ascending by a key', () => {
        const result = from(people()).orderBy(p => p.age).select(p => p.name).toArray()
        expect(result).toEqual(['Ana', 'Carmen', 'Bogdan', 'Elena', 'Dan'])
    })

    it('sorts descending by a key', () => {
        const result = from(people()).orderByDescending(p => p.age).select(p => p.name).toArray()
        expect(result).toEqual(['Dan', 'Bogdan', 'Elena', 'Carmen', 'Ana'])
    })

    it('is a stable sort - equal keys keep their original relative order', () => {
        const result = from(people()).orderBy(p => p.age).select(p => p.name).toArray()
        // Ana and Carmen are both 22; Ana appears first in the source and must stay first.
        expect(result.indexOf('Ana')).toBeLessThan(result.indexOf('Carmen'))
        // Bogdan and Elena are both 31; Bogdan appears first in the source.
        expect(result.indexOf('Bogdan')).toBeLessThan(result.indexOf('Elena'))
    })

    it('thenBy() breaks ties with a secondary ascending key', () => {
        const result = from(people())
            .orderBy(p => p.city)
            .thenBy(p => p.age)
            .select(p => `${p.city}:${p.age}`)
            .toArray()
        expect(result).toEqual(['Brasov:22', 'Brasov:22', 'Cluj:31', 'Cluj:45', 'Iasi:31'])
    })

    it('thenByDescending() breaks ties with a secondary descending key', () => {
        const result = from(people())
            .orderBy(p => p.city)
            .thenByDescending(p => p.age)
            .select(p => p.name)
            .toArray()
        expect(result).toEqual(['Ana', 'Carmen', 'Dan', 'Bogdan', 'Elena'])
    })

    it('accepts a custom comparer', () => {
        const result = from(['bb', 'a', 'ccc']).orderBy(x => x, (a, b) => a.length - b.length).toArray()
        expect(result).toEqual(['a', 'bb', 'ccc'])
    })
})

describe('groupBy', () => {
    it('groups elements and exposes the key on each grouping', () => {
        const groups = from(people()).groupBy(p => p.city).toArray()
        expect(groups.map(g => g.key).sort()).toEqual(['Brasov', 'Cluj', 'Iasi'])
        const brasov = groups.find(g => g.key === 'Brasov')
        expect(brasov.toArray().map(p => p.name)).toEqual(['Ana', 'Carmen'])
    })

    it('a grouping is itself a full Enumerable, chainable further', () => {
        const groups = from(people()).groupBy(p => p.city)
        const cluj = groups.first(g => g.key === 'Cluj')
        expect(cluj.select(p => p.name).toArray()).toEqual(['Bogdan', 'Dan'])
    })

    it('applies an element selector', () => {
        const groups = from(people()).groupBy(p => p.city, p => p.name).toArray()
        const brasov = groups.find(g => g.key === 'Brasov')
        expect(brasov.toArray()).toEqual(['Ana', 'Carmen'])
    })

    it('applies a result selector, bypassing the grouping wrapper', () => {
        const counts = from(people())
            .groupBy(p => p.city, undefined, (key, items) => ({ city: key, count: items.length }))
            .toArray()
        expect(counts.sort((a, b) => a.city.localeCompare(b.city))).toEqual([
            { city: 'Brasov', count: 2 },
            { city: 'Cluj', count: 2 },
            { city: 'Iasi', count: 1 }
        ])
    })
})

describe('join / groupJoin', () => {
    const cities = [
        { city: 'Brasov', country: 'RO' },
        { city: 'Cluj', country: 'RO' }
    ]

    it('join() is an inner join - unmatched outer rows are dropped', () => {
        const result = from(people())
            .join(cities, p => p.city, c => c.city, (p, c) => `${p.name}-${c.country}`)
            .toArray()
        // Elena is in Iasi, which has no match in `cities`, so she's excluded.
        expect(result).toEqual(['Ana-RO', 'Bogdan-RO', 'Carmen-RO', 'Dan-RO'])
    })

    it('groupJoin() keeps every outer row, with an empty match array when nothing joins', () => {
        const result = from(cities)
            .groupJoin(people(), c => c.city, p => p.city, (c, matches) => ({ city: c.city, names: matches.map(p => p.name) }))
            .toArray()
        expect(result).toEqual([
            { city: 'Brasov', names: ['Ana', 'Carmen'] },
            { city: 'Cluj', names: ['Bogdan', 'Dan'] }
        ])
    })
})

describe('toArray / toMap / toSet / toLookup', () => {
    it('toArray() materializes the sequence', () => {
        expect(from([1, 2, 3]).toArray()).toEqual([1, 2, 3])
    })

    it('toMap() keys by the selector and defaults values to the element', () => {
        const map = from(people()).toMap(p => p.name)
        expect(map.get('Ana').age).toBe(22)
    })

    it('toMap() applies a value selector and warns on duplicate keys', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const map = from(people()).toMap(p => p.city, p => p.name)
        expect(map.get('Cluj')).toBe('Dan') // last Cluj wins
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    it('toSet() dedupes, optionally by a key selector', () => {
        expect(from([1, 1, 2]).toSet()).toEqual(new Set([1, 2]))
        expect(from(people()).toSet(p => p.city)).toEqual(new Set(['Brasov', 'Cluj', 'Iasi']))
    })

    it('toLookup() groups eagerly into arrays keyed by the selector', () => {
        const lookup = from(people()).toLookup(p => p.city, p => p.name)
        expect(lookup.get('Brasov')).toEqual(['Ana', 'Carmen'])
        expect(lookup.get('Iasi')).toEqual(['Elena'])
    })
})

describe('forEach', () => {
    it('invokes the action for every element with its index', () => {
        const seen = []
        from(['a', 'b', 'c']).forEach((x, i) => seen.push([i, x]))
        expect(seen).toEqual([[0, 'a'], [1, 'b'], [2, 'c']])
    })
})

describe('count / any / all / contains / sequenceEqual', () => {
    it('count() counts all or matching elements', () => {
        expect(from(people()).count()).toBe(5)
        expect(from(people()).count(p => p.age === 22)).toBe(2)
    })

    it('any() checks existence, with or without a predicate', () => {
        expect(from([]).any()).toBe(false)
        expect(from([1]).any()).toBe(true)
        expect(from(people()).any(p => p.city === 'Iasi')).toBe(true)
        expect(from(people()).any(p => p.city === 'Sibiu')).toBe(false)
    })

    it('all() requires every element to match, vacuously true when empty', () => {
        expect(from(people()).all(p => p.age > 0)).toBe(true)
        expect(from(people()).all(p => p.age > 30)).toBe(false)
        expect(from([]).all(() => false)).toBe(true)
    })

    it('contains() uses Object.is by default and accepts a custom comparer', () => {
        expect(from([1, 2, 3]).contains(2)).toBe(true)
        expect(from([1, 2, 3]).contains(9)).toBe(false)
        expect(from([{ id: 1 }]).contains({ id: 1 }, (a, b) => a.id === b.id)).toBe(true)
    })

    it('sequenceEqual() compares element-by-element, including length', () => {
        expect(from([1, 2, 3]).sequenceEqual([1, 2, 3])).toBe(true)
        expect(from([1, 2]).sequenceEqual([1, 2, 3])).toBe(false)
        expect(from([1, 2, 3]).sequenceEqual([1, 2, 4])).toBe(false)
    })
})

describe('first / last / single and their *OrDefault variants', () => {
    it('first() and last() return matching elements or throw when none match', () => {
        expect(from(people()).first(p => p.city === 'Cluj').name).toBe('Bogdan')
        expect(from(people()).last(p => p.city === 'Cluj').name).toBe('Dan')
        expect(() => from(people()).first(p => p.city === 'Sibiu')).toThrow(/no matching element/)
        expect(() => empty().first()).toThrow(/no matching element/)
    })

    it('firstOrDefault()/lastOrDefault() support the (), (default), and (predicate, default) overloads', () => {
        expect(from([]).firstOrDefault()).toBeNull()
        expect(from([]).firstOrDefault('none')).toBe('none')
        expect(from(people()).firstOrDefault(p => p.city === 'Sibiu', 'none')).toBe('none')
        expect(from(people()).firstOrDefault(p => p.city === 'Cluj', 'none').name).toBe('Bogdan')

        expect(from([]).lastOrDefault()).toBeNull()
        expect(from(people()).lastOrDefault(p => p.city === 'Cluj', 'none').name).toBe('Dan')
    })

    it('single() requires exactly one match and throws otherwise', () => {
        expect(from(people()).single(p => p.city === 'Iasi').name).toBe('Elena')
        expect(() => from(people()).single(p => p.city === 'Cluj')).toThrow(/more than one/)
        expect(() => from(people()).single(p => p.city === 'Sibiu')).toThrow(/no matching element/)
    })

    it('singleOrDefault() mirrors single() but returns a default instead of throwing on zero matches', () => {
        expect(from(people()).singleOrDefault(p => p.city === 'Sibiu', 'none')).toBe('none')
        expect(() => from(people()).singleOrDefault(p => p.city === 'Cluj')).toThrow(/more than one/)
    })
})

describe('elementAt / elementAtOrDefault', () => {
    it('returns the element at an in-range index', () => {
        expect(from(['a', 'b', 'c']).elementAt(1)).toBe('b')
    })

    it('throws for an out-of-range index', () => {
        expect(() => from(['a']).elementAt(5)).toThrow(/out of range/)
    })

    it('elementAtOrDefault() returns a default instead of throwing', () => {
        expect(from(['a']).elementAtOrDefault(5)).toBeNull()
        expect(from(['a']).elementAtOrDefault(5, 'x')).toBe('x')
    })
})

describe('sum / average / min / max', () => {
    it('operate over raw numbers by default', () => {
        expect(from([1, 2, 3]).sum()).toBe(6)
        expect(from([1, 2, 3]).average()).toBe(2)
        expect(from([1, 2, 3]).min()).toBe(1)
        expect(from([1, 2, 3]).max()).toBe(3)
    })

    it('accept a selector', () => {
        expect(from(people()).sum(p => p.age)).toBe(151)
        expect(from(people()).average(p => p.age)).toBeCloseTo(30.2)
        expect(from(people()).min(p => p.age)).toBe(22)
        expect(from(people()).max(p => p.age)).toBe(45)
    })

    it('throw on an empty sequence for average/min/max, but sum() of empty is 0', () => {
        expect(from([]).sum()).toBe(0)
        expect(() => from([]).average()).toThrow(/no elements/)
        expect(() => from([]).min()).toThrow(/no elements/)
        expect(() => from([]).max()).toThrow(/no elements/)
    })
})

describe('aggregate / reduce', () => {
    it('aggregate(func) uses the first element as the seed and throws when empty', () => {
        expect(from([1, 2, 3, 4]).aggregate((acc, x) => acc + x)).toBe(10)
        expect(() => from([]).aggregate((acc, x) => acc + x)).toThrow(/no elements/)
    })

    it('aggregate(seed, func) folds from the given seed', () => {
        expect(from([1, 2, 3]).aggregate(10, (acc, x) => acc + x)).toBe(16)
        expect(from([]).aggregate(10, (acc, x) => acc + x)).toBe(10)
    })

    it('aggregate(seed, func, resultSelector) post-processes the accumulator', () => {
        const result = from([1, 2, 3]).aggregate(0, (acc, x) => acc + x, acc => `total=${acc}`)
        expect(result).toBe('total=6')
    })

    it('reduce() is an alias for aggregate() with the same overloads', () => {
        expect(from([1, 2, 3]).reduce((acc, x) => acc + x)).toBe(6)
        expect(from([1, 2, 3]).reduce(0, (acc, x) => acc + x)).toBe(6)
    })
})

describe('range / repeat / empty', () => {
    it('range() produces consecutive integers', () => {
        expect(range(5, 3).toArray()).toEqual([5, 6, 7])
        expect(range(0, 0).toArray()).toEqual([])
    })

    it('repeat() repeats a value n times', () => {
        expect(repeat('x', 3).toArray()).toEqual(['x', 'x', 'x'])
        expect(repeat('x', 0).toArray()).toEqual([])
    })

    it('empty() yields nothing', () => {
        expect(empty().toArray()).toEqual([])
        expect(empty().any()).toBe(false)
    })
})

describe('type identity', () => {
    it('orderBy()/orderByDescending() return an OrderedEnumerable', () => {
        expect(from([1]).orderBy(x => x)).toBeInstanceOf(OrderedEnumerable)
        expect(from([1]).orderBy(x => x)).toBeInstanceOf(Enumerable)
    })

    it('every other chain method returns a plain Enumerable', () => {
        expect(from([1]).where(() => true)).toBeInstanceOf(Enumerable)
        expect(from([1]).where(() => true)).not.toBeInstanceOf(OrderedEnumerable)
    })
})

describe('reactivity: toSignal()', () => {
    it('toArray() by default, tracking the underlying signal', () => {
        const list = signal([1, 2, 3])
        const evens = from(list).where(x => x % 2 === 0).toSignal()
        expect(evens()).toEqual([2])
        list([1, 2, 3, 4, 5, 6])
        expect(evens()).toEqual([2, 4, 6])
    })

    it('accepts a custom terminal operation for a scalar reactive result', () => {
        const cart = signal([{ price: 10 }, { price: 5 }])
        const total = from(cart).toSignal(q => q.sum(x => x.price))
        expect(total()).toBe(15)
        cart([...cart(), { price: 25 }])
        expect(total()).toBe(40)
    })

    it('only recomputes when the source actually changes (lazy computed)', () => {
        const list = signal([1, 2, 3])
        const selector = vi.fn(x => x * 2)
        const doubled = from(list).select(selector).toSignal()

        doubled()
        doubled()
        expect(selector).toHaveBeenCalledTimes(3) // one full pass, cached on the second read

        list([1, 2, 3]) // same values, but signal() only skips notifying on Object.is equality of the whole array reference
        doubled()
        expect(selector.mock.calls.length).toBeGreaterThan(3) // a new array reference always triggers recompute
    })

    it('composes with plain query chains before the reactive boundary', () => {
        const users = signal([
            { name: 'Ana', active: true },
            { name: 'Bogdan', active: false }
        ])
        const activeNames = from(users)
            .where(u => u.active)
            .orderBy(u => u.name)
            .select(u => u.name)
            .toSignal()

        expect(activeNames()).toEqual(['Ana'])
        users([...users(), { name: 'Abel', active: true }])
        expect(activeNames()).toEqual(['Abel', 'Ana'])
    })
})
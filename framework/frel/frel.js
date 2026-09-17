import { computed } from '../core/signal.js'

/** Default ascending comparer used by orderBy()/thenBy() when no comparer is supplied. */
function defaultComparer(a, b) {
    if (a === b) return 0
    if (a == null) return b == null ? 0 : -1
    if (b == null) return 1
    return a < b ? -1 : a > b ? 1 : 0
}

/** Splits the flexible (predicate?, defaultValue?) argument list used by the *OrDefault() methods. */
function resolveOrDefaultArgs(args) {
    if (args.length === 0) return { predicate: undefined, defaultValue: null }
    if (typeof args[0] === 'function') {
        return { predicate: args[0], defaultValue: args.length > 1 ? args[1] : null }
    }
    return { predicate: undefined, defaultValue: args[0] }
}

/** Wraps a group's key with its elements; iterating the result yields the elements, like a LINQ grouping. */
function createGrouping(key, items) {
    const grouping = new Enumerable(() => items)
    grouping.key = key
    return grouping
}

/**
 * A lazily-evaluated LINQ-to-Objects style sequence.
 * Every intermediate operator (where, select, orderBy, ...) is deferred
 */
export class Enumerable {
    constructor(iteratorFactory) {
        this._iteratorFactory = iteratorFactory
    }

    [Symbol.iterator]() {
        const iterable = this._iteratorFactory()
        return iterable[Symbol.iterator] ? iterable[Symbol.iterator]() : iterable
    }

    // deferred (lazy) operators - each returns a new Enumerable

    where(predicate) {
        const self = this
        return new Enumerable(function* () {
            let i = 0
            for (const item of self) 
                if (predicate(item, i++)) 
                    yield item
        })
    }

    select(selector) {
        const self = this
        return new Enumerable(function* () {
            let i = 0
            for (const item of self) 
                yield selector(item, i++)
        })
    }

    selectMany(collectionSelector, resultSelector) {
        const self = this
        return new Enumerable(function* () {
            let i = 0
            for (const item of self) {
                for (const inner of collectionSelector(item, i++)) {
                    yield resultSelector ? resultSelector(item, inner) : inner
                }
            }
        })
    }

    take(count) {
        const self = this
        return new Enumerable(function* () {
            if (count <= 0) return
            let i = 0
            for (const item of self) {
                yield item
                if (++i >= count) break
            }
        })
    }

    takeWhile(predicate) {
        const self = this
        return new Enumerable(function* () {
            let i = 0
            for (const item of self) {
                if (!predicate(item, i++)) break
                yield item
            }
        })
    }

    takeLast(count) {
        return new Enumerable(() => {
            if (count <= 0) return []
            const buffer = []
            for (const item of this) {
                buffer.push(item)
                if (buffer.length > count) 
                    buffer.shift()
            }
            return buffer
        })
    }

    skip(count) {
        const self = this
        return new Enumerable(function* () {
            let i = 0
            for (const item of self) {
                if (i++ < count) continue
                yield item
            }
        })
    }

    skipWhile(predicate) {
        const self = this
        return new Enumerable(function* () {
            let i = 0
            let skipping = true
            for (const item of self) {
                if (skipping && predicate(item, i++)) continue
                skipping = false
                yield item
            }
        })
    }

    skipLast(count) {
        const self = this
        return new Enumerable(function* () {
            if (count <= 0) {
                yield* self
                return
            }

            const buffer = []
            for (const item of self) {
                buffer.push(item)
                if (buffer.length > count) {
                    yield buffer.shift()
                }
            }
        })
    }

    distinct(keySelector) {
        const self = this
        return new Enumerable(function* () {
            const seen = new Set()
            for (const item of self) {
                const key = keySelector ? keySelector(item) : item
                if (seen.has(key)) continue
                seen.add(key)
                yield item
            }
        })
    }

    concat(...others) {
        const self = this
        return new Enumerable(function* () {
            yield* self
            for (const other of others) 
                yield* from(other)
        })
    }

    union(other, keySelector) {
        return this.concat(other).distinct(keySelector)
    }

    intersect(other, keySelector) {
        const self = this
        return new Enumerable(function* () {
            const otherKeys = new Set()
            for (const item of from(other)) 
                otherKeys.add(keySelector ? keySelector(item) : item)
            const seen = new Set()
            for (const item of self) {
                const key = keySelector ? keySelector(item) : item
                if (otherKeys.has(key) && !seen.has(key)) {
                    seen.add(key)
                    yield item
                }
            }
        })
    }

    except(other, keySelector) {
        const self = this
        return new Enumerable(function* () {
            const otherKeys = new Set()
            for (const item of from(other)) 
                otherKeys.add(keySelector ? keySelector(item) : item)
            const seen = new Set()
            for (const item of self) {
                const key = keySelector ? keySelector(item) : item
                if (!otherKeys.has(key) && !seen.has(key)) {
                    seen.add(key)
                    yield item
                }
            }
        })
    }

    zip(other, resultSelector) {
        const self = this
        return new Enumerable(function* () {
            const it1 = self[Symbol.iterator]()
            const it2 = from(other)[Symbol.iterator]()
            while (true) {
                const a = it1.next()
                const b = it2.next()
                if (a.done || b.done) return
                yield resultSelector ? resultSelector(a.value, b.value) : [a.value, b.value]
            }
        })
    }

    append(item) {
        return this.concat([item])
    }

    prepend(item) {
        const self = this
        return new Enumerable(function* () {
            yield item
            yield* self
        })
    }

    defaultIfEmpty(defaultValue = null) {
        const self = this
        return new Enumerable(function* () {
            let any = false
            for (const item of self) {
                any = true
                yield item
            }
            if (!any) yield defaultValue
        })
    }

    chunk(size) {
        if (!(size > 0)) throw new Error('[framework] chunk() size must be greater than 0')
        const self = this
        return new Enumerable(function* () {
            let buffer = []
            for (const item of self) {
                buffer.push(item)
                if (buffer.length === size) {
                    yield buffer
                    buffer = []
                }
            }
            if (buffer.length) yield buffer
        })
    }

    reverse() {
        const self = this
        return new Enumerable(function* () {
            const items = [...self]
            for (let i = items.length - 1; i >= 0; i--) 
                yield items[i]
        })
    }

    orderBy(keySelector, comparer = defaultComparer) {
        return new OrderedEnumerable(() => this, [{ keySelector, comparer, descending: false }])
    }

    orderByDescending(keySelector, comparer = defaultComparer) {
        return new OrderedEnumerable(() => this, [{ keySelector, comparer, descending: true }])
    }

    groupBy(keySelector, elementSelector, resultSelector) {
        const self = this
        return new Enumerable(function* () {
            const groups = new Map()
            for (const item of self) {
                const key = keySelector(item)
                const element = elementSelector ? elementSelector(item) : item
                if (!groups.has(key)) 
                    groups.set(key, [])
                groups.get(key).push(element)
            }
            for (const [key, items] of groups) {
                yield resultSelector ? resultSelector(key, items) : createGrouping(key, items)
            }
        })
    }

    join(inner, outerKeySelector, innerKeySelector, resultSelector) {
        const self = this
        return new Enumerable(function* () {
            const innerMap = new Map()
            for (const item of from(inner)) {
                const key = innerKeySelector(item)
                if (!innerMap.has(key)) 
                    innerMap.set(key, [])
                innerMap.get(key).push(item)
            }
            for (const outerItem of self) {
                const matches = innerMap.get(outerKeySelector(outerItem))
                if (!matches) 
                    continue
                for (const innerItem of matches) 
                    yield resultSelector(outerItem, innerItem)
            }
        })
    }

    groupJoin(inner, outerKeySelector, innerKeySelector, resultSelector) {
        const self = this
        return new Enumerable(function* () {
            const innerMap = new Map()
            for (const item of from(inner)) {
                const key = innerKeySelector(item)
                if (!innerMap.has(key)) 
                    innerMap.set(key, [])
                innerMap.get(key).push(item)
            }
            for (const outerItem of self) {
                const matches = innerMap.get(outerKeySelector(outerItem)) || []
                yield resultSelector(outerItem, matches)
            }
        })
    }

    // terminal (eager) operators

    toArray() {
        return [...this]
    }

    toMap(keySelector, valueSelector) {
        const map = new Map()
        let i = 0
        for (const item of this) {
            const key = keySelector(item, i)
            if (map.has(key)) 
                console.warn(`[framework] toMap(): duplicate key "${key}", overwriting previous value`)
            map.set(key, valueSelector ? valueSelector(item, i) : item)
            i++
        }
        return map
    }

    toSet(keySelector) {
        const set = new Set()
        let i = 0
        for (const item of this) {
            set.add(keySelector ? keySelector(item, i++) : item)
        }
        return set
    }

    toLookup(keySelector, elementSelector) {
        const map = new Map()
        let i = 0
        for (const item of this) {
            const key = keySelector(item, i)
            if (!map.has(key)) map.set(key, [])
            map.get(key).push(elementSelector ? elementSelector(item, i) : item)
            i++
        }
        return map
    }

    toObject(keySelector, valueSelector = x => x) {
        const obj = Object.create(null)
        let i = 0
        for (const item of this) {
            obj[keySelector(item, i)] = valueSelector(item, i)
            i++
        }
        return obj
    }


    forEach(action) {
        let i = 0
        for (const item of this) 
            action(item, i++)
    }

    count(predicate) {
        let n = 0, i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) n++
            i++
        }
        return n
    }

    any(predicate) {
        let i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) return true
            i++
        }
        return false
    }

    all(predicate) {
        let i = 0
        for (const item of this) {
            if (!predicate(item, i)) return false
            i++
        }
        return true
    }

    contains(value, comparer = Object.is) {
        for (const item of this) 
            if (comparer(item, value)) 
                return true
        return false
    }

    sequenceEqual(other, comparer = Object.is) {
        const it1 = this[Symbol.iterator]()
        const it2 = from(other)[Symbol.iterator]()
        while (true) {
            const a = it1.next()
            const b = it2.next()
            if (a.done && b.done) 
                return true
            if (a.done !== b.done) 
                return false
            if (!comparer(a.value, b.value)) 
                return false
        }
    }

    first(predicate) {
        let i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) return item
            i++
        }
        throw new Error('[framework] first(): sequence contains no matching element')
    }

    firstOrDefault(...args) {
        const { predicate, defaultValue } = resolveOrDefaultArgs(args)
        let i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) return item
            i++
        }
        return defaultValue
    }

    last(predicate) {
        let found, has = false, i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) {
                 found = item
                 has = true 
            }
            i++
        }
        if (!has) 
            throw new Error('[framework] last(): sequence contains no matching element')
        return found
    }

    lastOrDefault(...args) {
        const { predicate, defaultValue } = resolveOrDefaultArgs(args)
        let found = defaultValue, has = false, i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) {
                found = item
                has = true
            }
            i++
        }
        return has ? found : defaultValue
    }

    single(predicate) {
        let found, n = 0, i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) {
                if (++n > 1) 
                    throw new Error('[framework] single(): sequence contains more than one matching element')
                found = item
            }
            i++
        }
        if (n === 0) 
            throw new Error('[framework] single(): sequence contains no matching element')
        return found
    }

    singleOrDefault(...args) {
        const { predicate, defaultValue } = resolveOrDefaultArgs(args)
        let found = defaultValue, n = 0, i = 0
        for (const item of this) {
            if (!predicate || predicate(item, i)) {
                if (++n > 1) 
                    throw new Error('[framework] singleOrDefault(): sequence contains more than one matching element')
                found = item
            }
            i++
        }
        return n === 0 ? defaultValue : found
    }

    elementAt(index) {
        let i = 0
        for (const item of this) 
            if (i++ === index) 
                return item
        throw new Error(`[framework] elementAt(): index ${index} is out of range`)
    }

    elementAtOrDefault(index, defaultValue = null) {
        let i = 0
        for (const item of this) 
            if (i++ === index) 
                return item
        return defaultValue
    }

    sum(selector) {
        let total = 0
        for (const item of this) 
            total += selector ? selector(item) : item
        return total
    }

    average(selector) {
        let total = 0, n = 0
        for (const item of this) { 
            total += selector ? selector(item) : item
            n++
        }
        if (n === 0) 
            throw new Error('[framework] average(): sequence contains no elements')
        return total / n
    }

    min(selector) {
        let result, has = false
        for (const item of this) {
            const value = selector ? selector(item) : item
            if (!has || value < result) { 
                result = value
                has = true 
            }
        }
        if (!has) 
            throw new Error('[framework] min(): sequence contains no elements')
        return result
    }

    max(selector) {
        let result, has = false
        for (const item of this) {
            const value = selector ? selector(item) : item
            if (!has || value > result) {
                result = value
                has = true
            }
        }
        if (!has) 
            throw new Error('[framework] max(): sequence contains no elements')
        return result
    }

    minBy(keySelector, comparer = defaultComparer) {
        let minItem = null
        let minKey
        let has = false

        for (const item of this) {
            const key = keySelector(item)
            if (!has || comparer(key, minKey) < 0) {
                minKey = key
                minItem = item
                has = true
            }
        }

        return minItem
    }

    maxBy(keySelector, comparer = defaultComparer) {
        return this.minBy(keySelector, (a, b) => comparer(b, a))
    }

    aggregate(...args) {
        if (args.length === 1) {
            const [func] = args
            let acc, has = false, i = 0
            for (const item of this) {
                acc = has ? func(acc, item, i) : item
                has = true
                i++
            }
            if (!has) 
                throw new Error('[framework] aggregate(): sequence contains no elements')
            return acc
        }
        const [seed, func, resultSelector] = args
        let acc = seed, i = 0
        for (const item of this) {
            acc = func(acc, item, i)
            i++
        }
        return resultSelector ? resultSelector(acc) : acc
    }

    scan(...args) {
        const self = this
        if (args.length === 1) {
            const [func] = args
            return new Enumerable(function* () {
                let acc, has = false, i = 0
                for (const item of self) {
                    acc = has ? func(acc, item, i) : item
                    has = true
                    i++
                    yield acc
                }
            })
        }
        const [seed, func] = args
        return new Enumerable(function* () {
            let acc = seed, i = 0
            for (const item of self) {
                acc = func(acc, item, i)
                i++
                yield acc
            }
        })
    }

    // reactivity bridge

    /** Wraps a terminal call to this query in computed(), so the result stays in sync with any signals it reads. */
    toSignal(terminalOp) {
        const run = terminalOp || (query => query.toArray())
        return computed(() => run(this))
    }

    // JS-flavored aliases, for readability at call sites

    filter(predicate) {
        return this.where(predicate)
    }
    map(selector) {
        return this.select(selector)
    }
    flatMap(collectionSelector, resultSelector) {
        return this.selectMany(collectionSelector, resultSelector)
    }
    reduce(...args) {
        return this.aggregate(...args)
    }
}

/** An Enumerable produced by orderBy()/orderByDescending() that supports additional thenBy() tie-breakers. */
export class OrderedEnumerable extends Enumerable {
    constructor(sourceFactory, comparers) {
        super(function* () {
            const items = [...sourceFactory()]
            const indices = items.map((_, i) => i)
            indices.sort((a, b) => {
                for (const { keySelector, comparer, descending } of comparers) {
                    const cmp = comparer(keySelector(items[a]), keySelector(items[b]))
                    if (cmp !== 0) 
                        return descending ? -cmp : cmp
                }
                return a - b
            })
            for (const i of indices) 
                yield items[i]
        })
        this._sourceFactory = sourceFactory
        this._comparers = comparers
    }

    thenBy(keySelector, comparer = defaultComparer) {
        return new OrderedEnumerable(this._sourceFactory, [...this._comparers, { keySelector, comparer, descending: false }])
    }

    thenByDescending(keySelector, comparer = defaultComparer) {
        return new OrderedEnumerable(this._sourceFactory, [...this._comparers, { keySelector, comparer, descending: true }])
    }
}

/**
 * Wraps a source into a queryable, lazily-evaluated Enumerable.
 * Accepts arrays, strings, Maps/Sets, any iterable, another Enumerable, or a
 * function - including a Fusée signal/computed/resource accessor
 */
export function from(source) {
    if (source instanceof Enumerable) 
        return source
    if (source == null) 
        return new Enumerable(function* () {})
    if (typeof source === 'function') {
        return new Enumerable(function* () {
            const resolved = source()
            if (resolved != null) 
                yield* resolved
        })
    }
    return new Enumerable(function* () { yield* source })
}

/** Produces a lazy sequence of `count` consecutive integers starting at `start`. */
export function range(start, count) {
    return new Enumerable(function* () {
        for (let i = 0; i < count; i++) 
            yield start + i
    })
}

/** Produces a lazy sequence that repeats `element` `count` times. */
export function repeat(element, count) {
    return new Enumerable(function* () {
        for (let i = 0; i < count; i++) 
            yield element
    })
}

/** Returns an empty sequence. */
export function empty() {
    return new Enumerable(function* () {})
}
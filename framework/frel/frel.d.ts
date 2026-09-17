/** Structural shape of a Fusée signal, computed, or resource accessor. */
export type Signal<T> = (() => T) & { readonly isSignal: true }

/** Anything from() can consume: sync iterables, plain/signal getters, or another Enumerable. */
export type EnumerableSource<T> =
    | Iterable<T>
    | Signal<Iterable<T> | null | undefined>
    | (() => Iterable<T> | null | undefined)
    | Enumerable<T>
    | null
    | undefined

/** A LINQ grouping: an Enumerable of the group's elements, tagged with its key. */
export interface Grouping<K, T> extends Enumerable<T> {
    readonly key: K
}

export declare class Enumerable<T> implements Iterable<T> {
    protected constructor(iteratorFactory: () => Iterable<T> | Iterator<T>)

    [Symbol.iterator](): Iterator<T>

    where(predicate: (item: T, index: number) => boolean): Enumerable<T>
    filter(predicate: (item: T, index: number) => boolean): Enumerable<T>

    select<R>(selector: (item: T, index: number) => R): Enumerable<R>
    map<R>(selector: (item: T, index: number) => R): Enumerable<R>

    selectMany<R>(collectionSelector: (item: T, index: number) => Iterable<R>): Enumerable<R>
    selectMany<C, R>(collectionSelector: (item: T, index: number) => Iterable<C>, resultSelector: (item: T, inner: C) => R): Enumerable<R>
    flatMap<R>(collectionSelector: (item: T, index: number) => Iterable<R>): Enumerable<R>
    flatMap<C, R>(collectionSelector: (item: T, index: number) => Iterable<C>, resultSelector: (item: T, inner: C) => R): Enumerable<R>

    take(count: number): Enumerable<T>
    takeWhile(predicate: (item: T, index: number) => boolean): Enumerable<T>
    takeLast(count: number): Enumerable<T>
    skip(count: number): Enumerable<T>
    skipWhile(predicate: (item: T, index: number) => boolean): Enumerable<T>
    skipLast(count: number): Enumerable<T>

    distinct(keySelector?: (item: T) => unknown): Enumerable<T>

    concat(...others: EnumerableSource<T>[]): Enumerable<T>
    union(other: EnumerableSource<T>, keySelector?: (item: T) => unknown): Enumerable<T>
    intersect(other: EnumerableSource<T>, keySelector?: (item: T) => unknown): Enumerable<T>
    except(other: EnumerableSource<T>, keySelector?: (item: T) => unknown): Enumerable<T>

    zip<U>(other: EnumerableSource<U>): Enumerable<[T, U]>
    zip<U, R>(other: EnumerableSource<U>, resultSelector: (a: T, b: U) => R): Enumerable<R>

    append(item: T): Enumerable<T>
    prepend(item: T): Enumerable<T>
    defaultIfEmpty(defaultValue?: T | null): Enumerable<T | null>

    chunk(size: number): Enumerable<T[]>
    reverse(): Enumerable<T>

    orderBy(keySelector: (item: T) => unknown, comparer?: (a: unknown, b: unknown) => number): OrderedEnumerable<T>
    orderByDescending(keySelector: (item: T) => unknown, comparer?: (a: unknown, b: unknown) => number): OrderedEnumerable<T>

    groupBy<K>(keySelector: (item: T) => K): Enumerable<Grouping<K, T>>
    groupBy<K, E>(keySelector: (item: T) => K, elementSelector: (item: T) => E): Enumerable<Grouping<K, E>>
    groupBy<K, R>(keySelector: (item: T) => K, elementSelector: undefined, resultSelector: (key: K, items: T[]) => R): Enumerable<R>
    groupBy<K, E, R>(keySelector: (item: T) => K, elementSelector: (item: T) => E, resultSelector: (key: K, items: E[]) => R): Enumerable<R>

    join<I, K, R>(inner: EnumerableSource<I>, outerKeySelector: (item: T) => K, innerKeySelector: (item: I) => K, resultSelector: (outer: T, inner: I) => R): Enumerable<R>
    groupJoin<I, K, R>(inner: EnumerableSource<I>, outerKeySelector: (item: T) => K, innerKeySelector: (item: I) => K, resultSelector: (outer: T, inners: I[]) => R): Enumerable<R>

    toArray(): T[]

    toMap<K>(keySelector: (item: T, index: number) => K): Map<K, T>
    toMap<K, V>(keySelector: (item: T, index: number) => K, valueSelector: (item: T, index: number) => V): Map<K, V>
    toObject<K extends PropertyKey, V = T>(keySelector: (item: T) => K, valueSelector?: (item: T) => V): Record<K, V>

    toSet(): Set<T>
    toSet<K>(keySelector: (item: T) => K): Set<K>

    toLookup<K>(keySelector: (item: T) => K): Map<K, T[]>
    toLookup<K, E>(keySelector: (item: T) => K, elementSelector: (item: T) => E): Map<K, E[]>

    forEach(action: (item: T, index: number) => void): void

    count(predicate?: (item: T) => boolean): number
    any(predicate?: (item: T) => boolean): boolean
    all(predicate: (item: T) => boolean): boolean
    contains(value: T, comparer?: (a: T, b: T) => boolean): boolean
    sequenceEqual(other: EnumerableSource<T>, comparer?: (a: T, b: T) => boolean): boolean

    first(predicate?: (item: T) => boolean): T
    firstOrDefault(): T | null
    firstOrDefault<D>(defaultValue: D): T | D
    firstOrDefault<D = null>(predicate: (item: T) => boolean, defaultValue?: D): T | D

    last(predicate?: (item: T) => boolean): T
    lastOrDefault(): T | null
    lastOrDefault<D>(defaultValue: D): T | D
    lastOrDefault<D = null>(predicate: (item: T) => boolean, defaultValue?: D): T | D

    single(predicate?: (item: T) => boolean): T
    singleOrDefault(): T | null
    singleOrDefault<D>(defaultValue: D): T | D
    singleOrDefault<D = null>(predicate: (item: T) => boolean, defaultValue?: D): T | D

    elementAt(index: number): T
    elementAtOrDefault<D = null>(index: number, defaultValue?: D): T | D

    sum(selector?: (item: T) => number): number
    average(selector?: (item: T) => number): number
    min(selector?: (item: T) => number): number
    max(selector?: (item: T) => number): number
    minBy<K>(keySelector: (item: T) => K, comparer?: (a: K, b: K) => number): T | null
    maxBy<K>(keySelector: (item: T) => K, comparer?: (a: K, b: K) => number): T | null

    aggregate(func: (acc: T, item: T) => T): T
    aggregate<A>(seed: A, func: (acc: A, item: T) => A): A
    aggregate<A, R>(seed: A, func: (acc: A, item: T) => A, resultSelector: (acc: A) => R): R
    scan<A>(seed: A, func: (acc: A, item: T) => A): Enumerable<A>

    reduce(func: (acc: T, item: T) => T): T
    reduce<A>(seed: A, func: (acc: A, item: T) => A): A
    reduce<A, R>(seed: A, func: (acc: A, item: T) => A, resultSelector: (acc: A) => R): R

    toSignal(): Signal<T[]>
    toSignal<R>(terminalOp: (query: Enumerable<T>) => R): Signal<R>
}

export declare class OrderedEnumerable<T> extends Enumerable<T> {
    thenBy(keySelector: (item: T) => unknown, comparer?: (a: unknown, b: unknown) => number): OrderedEnumerable<T>
    thenByDescending(keySelector: (item: T) => unknown, comparer?: (a: unknown, b: unknown) => number): OrderedEnumerable<T>
}

export declare function from<T>(source: EnumerableSource<T>): Enumerable<T>
export declare function range(start: number, count: number): Enumerable<number>
export declare function repeat<T>(element: T, count: number): Enumerable<T>
export declare function empty<T = never>(): Enumerable<T>
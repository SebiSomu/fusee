import { getInFlightStore } from './async-context.js'

let currentEffect = null
let currentOwner = null
let onEffectCreated = null

export function setEffectHook(fn) { onEffectCreated = fn }

export function onCleanup(fn) {
    if (!currentOwner) return
    currentOwner.cleanups.add(fn)
}

let batchDepth = 0
const pendingEffects = new Set()

export function batch(fn) {
    batchDepth++
    try {
        return fn()
    } finally {
        batchDepth--
        if (batchDepth === 0) {
            while (pendingEffects.size > 0) {
                const toRun = [...pendingEffects]
                pendingEffects.clear()
                for (const eff of toRun) eff()
            }
        }
    }
}

const asyncJobQueueHigh = []
const asyncJobQueueLow = []
let asyncJobFlushScheduled = false

function flushAsyncJobs() {
    asyncJobFlushScheduled = false

    while (asyncJobQueueHigh.length || asyncJobQueueLow.length) {
        const job = asyncJobQueueHigh.shift() || asyncJobQueueLow.shift()
        try {
            job()
        } catch (e) {
            console.warn('[framework] Async job error:', e)
        }
    }
}

export function scheduleAsyncJob(fn, opts = {}) {
    const priority = opts.priority || 'high'
    if (priority === 'low') asyncJobQueueLow.push(fn)
    else asyncJobQueueHigh.push(fn)

    if (!asyncJobFlushScheduled) {
        asyncJobFlushScheduled = true
        setTimeout(flushAsyncJobs, 0)
    }
}

function scheduleEffect(effectFn) {
    if (batchDepth > 0) {
        pendingEffects.add(effectFn)
    } else {
        effectFn()
    }
}

export function signal(initialValue) {
    let value = initialValue
    const subscribers = new Set()

    function accessor() {
        if (arguments.length === 0) {
            if (currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }
            return value
        } else {
            const newValue = arguments[0]
            if (!Object.is(value, newValue)) {
                value = newValue
                for (const sub of [...subscribers]) scheduleEffect(sub)
            }
        }
    }

    accessor.isSignal = true

    if (Array.isArray(initialValue)) addMutatingArrayMethods(accessor)
    addReactiveArrayMethods(accessor)

    return accessor
}

export function effect(fn) {
    let active = true
    let running = false

    const owner = {
        children: new Set(),
        cleanups: new Set()
    }

    const run = () => {
        if (!active || running) {
            if (running) console.warn('[framework] Recursive effect detected')
            return
        }

        running = true

        for (const dep of run.deps) dep.delete(run)
        run.deps.clear()

        const prevEffect = currentEffect
        const prevOwner = currentOwner

        currentEffect = run
        currentOwner = owner

        try { fn() }
        finally {
            currentEffect = prevEffect
            currentOwner = prevOwner
            running = false
        }
    }

    run.deps = new Set()

    const cleanup = () => {
        if (!active) return
        active = false

        pendingEffects.delete(run)

        for (const dep of run.deps) dep.delete(run)
        run.deps.clear()

        for (const child of owner.children) child()
        owner.children.clear()

        for (const fn of owner.cleanups) fn()
        owner.cleanups.clear()
    }

    if (onEffectCreated) onEffectCreated(cleanup)
    if (currentOwner) {
        currentOwner.children.add(cleanup)
    }

    run()
    return cleanup
}

export function computed(fn) {
    let value
    let dirty = true
    let active = true
    const subscribers = new Set()
    const deps = new Set()

    const computedNode = () => {
    if (!active || dirty) return

    if (subscribers.size > 0) {
        if (!runRecompute()) return
    } else {
        dirty = true
        for (const d of deps) d.delete(computedNode)
        deps.clear()
        return
    }

    for (const sub of [...subscribers]) scheduleEffect(sub)
}

    computedNode.deps = deps

    let computing = false

    function runRecompute() {
        if (computing) {
            console.warn('[framework] Circular dependency detected in computed()')
            return false
        }

        computing = true
        for (const d of deps) d.delete(computedNode)
        deps.clear()

        const prevEffect = currentEffect
        currentEffect = active ? computedNode : null
        try {
            const newValue = fn()
            const changed = !Object.is(newValue, value)
            value = newValue
            dirty = false
            return changed
        } finally {
            currentEffect = prevEffect
            computing = false
        }
    }

    function accessor() {
        if (arguments.length === 0) {
            if (active && currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }

            if (dirty) {
                runRecompute()
            }

            return value
        }
        console.warn('[framework] computed() is read-only')
    }

    accessor.dispose = () => {
        active = false
        dirty = true
        pendingEffects.delete(computedNode)
        for (const d of deps) d.delete(computedNode)
        deps.clear()
        subscribers.clear()
    }

    accessor.isSignal = true
    accessor.readonly = true
    addReactiveArrayMethods(accessor)

    return accessor
}

export function untrack(fn) {
    const prevEffect = currentEffect
    currentEffect = null
    try {
        return fn()
    } finally {
        currentEffect = prevEffect
    }
}

export function watch(source, callback, options = {}) {
    if (typeof callback !== 'function') {
        console.warn('[framework] watch() callback must be a function')
        return () => { }
    }

    const { immediate = false, equals = Object.is } = options
    const { getter, isMultiSource } = normalizeWatchSource(source)

    let initialized = false
    let oldValue
    const cleanupRef = { fn: null }

    const onCleanup = (fn) => {
        if (typeof fn !== 'function') {
            console.warn('[framework] onCleanup() expects a function')
            return
        }
        cleanupRef.fn = fn
    }

    const stopEffect = effect(() => {
        const newValue = getter()

        if (!initialized) {
            initialized = true
            oldValue = cloneWatchValue(newValue, isMultiSource)
            if (immediate) {
                untrack(() => callback(newValue, undefined, onCleanup))
            }
            return
        }

        if (!hasWatchChanged(newValue, oldValue, isMultiSource, equals)) {
            return
        }

        const previousValue = oldValue
        oldValue = cloneWatchValue(newValue, isMultiSource)

        runWatchCleanup(cleanupRef)
        untrack(() => callback(newValue, previousValue, onCleanup))
    })

    return () => {
        stopEffect()
        runWatchCleanup(cleanupRef)
    }
}

export function inspect(...args) {
    const isDev = typeof import.meta.env !== 'undefined' ? !!import.meta.env.DEV : true
    if (!isDev) return

    return effect(() => {
        const values = args.map(arg => {
            if (typeof arg === 'function') {
                return arg()
            }
            return arg
        })
        console.log('[inspect]', ...values)
    })
}

function addReactiveArrayMethods(accessor) {
    // Transformations
    accessor.map = (fn) => computed(() => accessor()?.map?.(fn) ?? [])
    accessor.filter = (fn) => computed(() => accessor()?.filter?.(fn) ?? [])
    accessor.slice = (...args) => computed(() => accessor()?.slice?.(...args) ?? [])
    accessor.concat = (...args) => computed(() => accessor()?.concat?.(...args) ?? [])
    accessor.flat = (depth) => computed(() => accessor()?.flat?.(depth) ?? [])
    accessor.flatMap = (fn) => computed(() => accessor()?.flatMap?.(fn) ?? [])

    // Searches
    accessor.find = (fn) => computed(() => accessor()?.find?.(fn))
    accessor.findLast = (fn) => computed(() => accessor()?.findLast?.(fn))
    accessor.findIndex = (fn) => computed(() => accessor()?.findIndex?.(fn))
    accessor.findLastIndex = (fn) => computed(() => accessor()?.findLastIndex?.(fn))
    accessor.indexOf = (searchElement, fromIdx) => computed(() => accessor()?.indexOf?.(searchElement, fromIdx))
    accessor.lastIndexOf = (searchElement, fromIdx) => computed(() => accessor()?.lastIndexOf?.(searchElement, fromIdx))
    accessor.includes = (searchElement, fromIdx) => computed(() => accessor()?.includes?.(searchElement, fromIdx))

    // Validations
    accessor.every = (fn) => computed(() => accessor()?.every?.(fn))
    accessor.some = (fn) => computed(() => accessor()?.some?.(fn))

    // Accumulators & Access
    accessor.reduce = (...args) => computed(() => accessor()?.reduce?.(...args))
    accessor.at = (index) => computed(() => accessor()?.at?.(index))
    accessor.join = (separator) => computed(() => accessor()?.join?.(separator) ?? '')
}

function addMutatingArrayMethods(accessor) {
    accessor.push = (...items) => {
        const next = [...accessor(), ...items]
        accessor(next)
        return next.length
    }

    accessor.pop = () => {
        const arr = accessor()
        if (arr.length === 0) return undefined
        const item = arr[arr.length - 1]
        accessor(arr.slice(0, -1))
        return item
    }

    accessor.shift = () => {
        const arr = accessor()
        if (arr.length === 0) return undefined
        const item = arr[0]
        accessor(arr.slice(1))
        return item
    }

    accessor.unshift = (...items) => {
        const next = [...items, ...accessor()]
        accessor(next)
        return next.length
    }

    accessor.splice = (start, deleteCount, ...items) => {
        const arr = [...accessor()]
        const removed = arr.splice(start, deleteCount, ...items)
        accessor(arr)
        return removed
    }

    accessor.remove = (predicate) => {
        accessor(accessor().filter((item, i) => !predicate(item, i)))
    }

    accessor.clear = () => {
        accessor([])
    }

    accessor.sort = (compareFn) => {
        const next = [...accessor()].sort(compareFn)
        accessor(next)
        return accessor
    }

    accessor.reverse = () => {
        const next = [...accessor()].reverse()
        accessor(next)
        return accessor
    }
}

function normalizeWatchSource(source) {
    if (Array.isArray(source)) {
        const getters = source.map(normalizeSingleWatchSource)
        return {
            getter: () => getters.map(get => get()),
            isMultiSource: true
        }
    }
    return {
        getter: normalizeSingleWatchSource(source),
        isMultiSource: false
    }
}

function normalizeSingleWatchSource(source) {
    if (typeof source === 'function') return source
    console.warn('[framework] watch() source should be a signal, getter, or an array of those')
    return () => source
}

function cloneWatchValue(value, isMultiSource) {
    if (isMultiSource && Array.isArray(value)) return value.slice()
    return value
}

function hasWatchChanged(newValue, oldValue, isMultiSource, equals) {
    if (isMultiSource) {
        if (!Array.isArray(oldValue) || newValue.length !== oldValue.length) return true
        for (let i = 0; i < newValue.length; i++) {
            if (!equals(newValue[i], oldValue[i])) return true
        }
        return false
    }
    return !equals(newValue, oldValue)
}

export function resource(sourceOrFetcher, fetcherOrOptions, optionsObj) {
    let source = null
    let actualFetcher = null
    let options = {}

    if (arguments.length === 1) {
        actualFetcher = sourceOrFetcher
    } else if (arguments.length === 2) {
        if (typeof fetcherOrOptions === 'function') {
            source = sourceOrFetcher
            actualFetcher = fetcherOrOptions
        } else {
            actualFetcher = sourceOrFetcher
            options = fetcherOrOptions || {}
        }
    } else if (arguments.length >= 3) {
        source = sourceOrFetcher
        actualFetcher = fetcherOrOptions
        options = optionsObj || {}
    }

    const data = signal(undefined)
    const loading = signal(false)
    const isFetching = signal(false)
    const error = signal(undefined)

    let currentPromiseId = 0
    let currentPromise = null
    const cache = new Map()
    const staleTime = typeof options.staleTime === 'number' ? options.staleTime : 0

    function serializeKey(input) {
        if (input === undefined) return 'undefined'
        if (input === null) return 'null'
        if (typeof input === 'object') return JSON.stringify(input)
        return String(input)
    }

    function makeScheduledPromise(runFetcher) {
        try {
            return Promise.resolve(runFetcher())
        } catch (e) {
            return Promise.reject(e)
        }
    }

    async function load(input, force = false) {
        const key = serializeKey(input)
        const cached = force ? null : cache.get(key)
        const isStale = !cached || (Date.now() - cached.updatedAt > staleTime)

        if (cached) {
            batch(() => {
                data(cached.data)
                error(undefined)
                loading(false)
            })
            if (!isStale && !force) return
            batch(() => { isFetching(true) })
        } else {
            batch(() => {
                loading(true)
                isFetching(true)
                error(undefined)
            })
        }

        const id = ++currentPromiseId

        batch(() => {
            isFetching(true)
        })

        let promise

        const { byKey, byFetcher } = getInFlightStore()

        if (options.key !== undefined) {
            const dedupeKey = `key_${options.key}_${key}`
            promise = byKey.get(dedupeKey)
            if (!promise) {
                promise = makeScheduledPromise(() => actualFetcher(input))
                byKey.set(dedupeKey, promise)
                promise.finally(() => {
                    if (byKey.get(dedupeKey) === promise) {
                        byKey.delete(dedupeKey)
                    }
                }).catch(() => {})
            }
        } else {
            let inFlightMap = byFetcher.get(actualFetcher)
            if (!inFlightMap) {
                inFlightMap = new Map()
                byFetcher.set(actualFetcher, inFlightMap)
            }
            promise = inFlightMap.get(key)
            if (!promise) {
                promise = makeScheduledPromise(() => actualFetcher(input))
                inFlightMap.set(key, promise)
                promise.finally(() => {
                    if (inFlightMap.get(key) === promise) {
                        inFlightMap.delete(key)
                    }
                }).catch(() => {})
            }
        }

        currentPromise = promise

        try {
            const result = await promise

            if (id !== currentPromiseId) return

            cache.set(key, { data: result, updatedAt: Date.now() })

            batch(() => {
                data(result)
                loading(false)
                isFetching(false)
            })

            currentPromise = null
        } catch (err) {
            if (id !== currentPromiseId) return

            batch(() => {
                error(err)
                loading(false)
                isFetching(false)
            })

            currentPromise = null
        }
    }

    if (source) {
        effect(() => {
            const input = typeof source === 'function' ? source() : source
            if (input !== null && input !== false && input !== undefined) {
                load(input)
            }
        })
    } else {
        load()
    }

    const accessor = () => data()
    accessor.isSignal = true
    accessor.loading = loading
    accessor.isFetching = isFetching
    accessor.error = error
    accessor.read = () => {
        if (loading() && currentPromise) {
            throw currentPromise
        }
        const err = error()
        if (err !== undefined) {
            throw err
        }
        return data()
    }

    const mutate = (val) => {
        const input = source ? (typeof source === 'function' ? source() : source) : undefined
        const key = serializeKey(input)
        cache.set(key, { data: val, updatedAt: Date.now() })
        data(val)
    }

    const refetch = () => {
        const input = source ? (typeof source === 'function' ? source() : source) : undefined
        load(input, true)
    }

    return [accessor, { mutate, refetch }]
}

function runWatchCleanup(cleanupRef) {
    if (typeof cleanupRef.fn === 'function') {
        const fn = cleanupRef.fn
        cleanupRef.fn = null
        untrack(() => fn())
    }
}

export function createSuspense(renderFn, fallbackFn, options = {}) {
    const out = signal(undefined)
    const pending = signal(false)
    const errSig = signal(undefined)

    const retryTick = signal(0)
    let token = 0

    const dispose = effect(() => {
        retryTick()
        const myToken = ++token
        let canceled = false
        onCleanup(() => { canceled = true })

        try {
            pending(false)
            errSig(undefined)
            const v = renderFn()
            out(v)
        } catch (e) {
            if (e instanceof Promise) {
                pending(true)
                errSig(undefined)
                out(typeof fallbackFn === 'function' ? fallbackFn() : fallbackFn)

                e.then(
                    () => {
                        if (canceled) return
                        if (myToken !== token) return
                        retryTick(retryTick() + 1)
                    },
                    (err) => {
                        if (canceled) return
                        if (myToken !== token) return
                        errSig(err)
                        pending(false)
                        if (options.onError) options.onError(err)
                        retryTick(retryTick() + 1)
                    }
                )

                return
            }

            errSig(e)
            pending(false)
            if (options.onError) options.onError(e)
        }
    })

    out.pending = pending
    out.error = errSig

    return [out, dispose]
}

let currentEffect = null
let onEffectCreated = null

export function setEffectHook(fn) { onEffectCreated = fn }

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

    const run = () => {
        if (!active) return

        for (const dep of run.deps) dep.delete(run)
        run.deps.clear()

        const prevEffect = currentEffect
        currentEffect = run
        try { fn() }
        finally { currentEffect = prevEffect }
    }

    run.deps = new Set()

    const cleanup = () => {
        active = false
        pendingEffects.delete(run)
        for (const dep of run.deps) dep.delete(run)
        run.deps.clear()
    }

    if (onEffectCreated) onEffectCreated(cleanup)
    run()

    return cleanup
}

export function computed(fn) {
    let value
    let dirty = true
    let active = true
    const subscribers = new Set()

    const computedNode = () => {
        if (!active || dirty) return

        // If we have no subscribers, we stay lazy.
        if (subscribers.size === 0) {
            dirty = true
            // Clear deps to stop receiving updates until next read
            for (const dep of computedNode.deps) dep.delete(computedNode)
            computedNode.deps.clear()
            return
        }

        // Suppression logic: if we have subs, we must check if value actually changed
        const prevValue = value
        for (const dep of computedNode.deps) dep.delete(computedNode)
        computedNode.deps.clear()

        const prevEffect = currentEffect
        currentEffect = computedNode
        try {
            const newValue = fn()
            if (Object.is(newValue, prevValue)) {
                dirty = false
                return // Suppress notification
            }
            value = newValue
        } finally {
            currentEffect = prevEffect
            dirty = false
        }

        // Notify downstream if value changed
        for (const sub of [...subscribers]) scheduleEffect(sub)
    }

    computedNode.deps = new Set()

    function accessor() {
        if (arguments.length === 0) {
            if (active && currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }

            if (dirty) {
                for (const dep of computedNode.deps) dep.delete(computedNode)
                computedNode.deps.clear()

                const prevEffect = currentEffect
                currentEffect = active ? computedNode : null
                try {
                    const newValue = fn()
                    value = newValue
                } finally {
                    currentEffect = prevEffect
                    dirty = false
                }
            }

            return value
        }
        console.warn('[framework] computed() is read-only')
    }

    accessor.dispose = () => {
        active = false
        dirty = true
        pendingEffects.delete(computedNode)
        for (const dep of computedNode.deps) dep.delete(computedNode)
        computedNode.deps.clear()
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

export function watchEffect(fn) {
    if (typeof fn !== 'function') {
        console.warn('[framework] watchEffect() expects a function')
        return () => { }
    }

    const cleanupRef = { fn: null }
    const onCleanup = (cleanup) => {
        if (typeof cleanup !== 'function') {
            console.warn('[framework] onCleanup() expects a function')
            return
        }
        cleanupRef.fn = cleanup
    }

    const stopEffect = effect(() => {
        runWatchCleanup(cleanupRef)
        fn(onCleanup)
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

// Helpers for watch/watchEffect
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

function runWatchCleanup(cleanupRef) {
    if (typeof cleanupRef.fn === 'function') {
        const fn = cleanupRef.fn
        cleanupRef.fn = null
        untrack(() => fn())
    }
}

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
    const run = () => {
        for (const dep of run.deps) dep.delete(run)
        run.deps.clear()

        currentEffect = run
        try { fn() }
        finally { currentEffect = null }
    }

    run.deps = new Set()
    const cleanup = () => {
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
    const subscribers = new Set()

    const computedNode = () => {
        if (!dirty) {
            dirty = true
            for (const dep of computedNode.deps) dep.delete(computedNode)
            computedNode.deps.clear()
            for (const sub of [...subscribers]) scheduleEffect(sub)
        }
    }

    computedNode.deps = new Set()

    function accessor() {
        if (arguments.length === 0) {
            if (currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }
            if (dirty) {
                for (const dep of computedNode.deps) dep.delete(computedNode)
                computedNode.deps.clear()

                const prevEffect = currentEffect
                currentEffect = computedNode
                try {
                    const newValue = fn()
                    if (newValue !== value) value = newValue
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

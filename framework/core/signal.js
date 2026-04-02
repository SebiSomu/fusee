// ─── Reactivity Engine ───────────────────────────────────────────────────────

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
                for (const effect of toRun) effect()
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

    if (onEffectCreated)
        onEffectCreated(cleanup)
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
                    if (newValue !== value) {
                        value = newValue
                    }
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

// ─── Reactivity Engine ───────────────────────────────────────────────────────
// Solid-style signals: count() to read, count(val) to write.
// An "effect" is any function that should re-run when signals it reads change.

let currentEffect = null

// ─── Batching ────────────────────────────────────────────────────────────────
// Collects all pending effect runs during a batch, then flushes them once.
let batchDepth = 0
const pendingEffects = new Set()

export function batch(fn) {
    batchDepth++
    try {
        return fn()
    } finally {
        batchDepth--
        if (batchDepth === 0) {
            // Flush all pending effects once
            const toRun = [...pendingEffects]
            pendingEffects.clear()
            for (const effect of toRun) effect()
        }
    }
}

function scheduleEffect(effectFn) {
    if (batchDepth > 0) {
        // Inside batch — defer execution
        pendingEffects.add(effectFn)
    } else {
        // Outside batch — run immediately
        effectFn()
    }
}

// ─── Sentinel for distinguishing signal() read vs signal(undefined) write ────
const SIGNAL_NO_ARG = Symbol('SIGNAL_NO_ARG')

// ─── signal(initialValue) ────────────────────────────────────────────────────
// Uses arguments.length to distinguish read (0 args) from write (1 arg),
// so signal(undefined) correctly writes `undefined` instead of reading.
export function signal(initialValue) {
    let value = initialValue
    const subscribers = new Set()

    function accessor() {
        if (arguments.length === 0) {
            // READ — track dependency if inside an effect
            if (currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }
            return value
        } else {
            // WRITE — notify subscribers only if value changed
            const newValue = arguments[0]
            if (newValue !== value) {
                value = newValue
                for (const sub of [...subscribers]) scheduleEffect(sub)
            }
        }
    }

    return accessor
}

// ─── effect(fn) ──────────────────────────────────────────────────────────────
export function effect(fn) {
    const run = () => {
        // Clean up previous subscriptions before re-running
        for (const dep of run.deps) dep.delete(run)
        run.deps.clear()

        currentEffect = run
        try { fn() }
        finally { currentEffect = null }
    }

    run.deps = new Set()
    run() // run immediately to collect dependencies
    return run
}

// ─── computed(fn) ────────────────────────────────────────────────────────────
// Pull-based lazy evaluation with push-based invalidation.
export function computed(fn) {
    let value
    let dirty = true
    let initialized = false
    const subscribers = new Set()

    const e = effect(() => {
        if (!initialized) {
            // First run — compute value AND track deps
            value = fn()
            dirty = false
            initialized = true
        } else {
            // Re-triggered by dependency change — just invalidate
            dirty = true
            // Notify downstream effects/computeds that this value changed
            for (const sub of [...subscribers]) scheduleEffect(sub)
        }
    })

    function accessor() {
        if (arguments.length === 0) {
            // READ — register as dependency for any outer effect
            if (currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }
            if (dirty) {
                // Lazy recomputation with dep tracking so the effect
                // stays subscribed to the correct upstream signals
                const prevEffect = currentEffect
                currentEffect = e  // track deps under our internal effect
                try {
                    value = fn()
                    dirty = false
                } finally {
                    currentEffect = prevEffect
                }
            }
            return value
        }
        console.warn('[framework] computed() is read-only')
    }

    return accessor
}

// ─── untrack(fn) ─────────────────────────────────────────────────────────────
// Runs fn without tracking any signal reads as dependencies.
// Useful inside effects when you need to read a signal without subscribing.
export function untrack(fn) {
    const prevEffect = currentEffect
    currentEffect = null
    try {
        return fn()
    } finally {
        currentEffect = prevEffect
    }
}

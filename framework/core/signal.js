// ─── Reactivity Engine ───────────────────────────────────────────────────────
// Solid-style signals: count() to read, count(val) to write.
// An "effect" is any function that should re-run when signals it reads change.

let currentEffect = null

export function signal(initialValue) {
    let value = initialValue
    const subscribers = new Set()

    function accessor(newValue) {
        if (newValue === undefined) {
            // READ — track dependency if inside an effect
            if (currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }
            return value
        } else {
            // WRITE — notify subscribers only if value changed
            if (newValue !== value) {
                value = newValue
                for (const sub of [...subscribers]) sub()
            }
        }
    }

    return accessor
}

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

export function computed(fn) {
    let value
    let dirty = true // for lazy-loading
    const subscribers = new Set()

    const runner = effect(() => {
        console.log('[computed] tracking dependencies...')
        fn()
        if (!dirty) {
            dirty = true
            console.log('[computed] dependencies changed, marking dirty')
            for (const sub of [...subscribers]) sub()
        }
    })

    dirty = true
    console.log('[computed] initialized, ready for lazy eval')

    function accessor(newValue) {
        if (newValue === undefined) {
            if (currentEffect) {
                subscribers.add(currentEffect)
                currentEffect.deps.add(subscribers)
            }
            if (dirty) {
                console.log('[computed] dirty - recomputing value')
                const prevEffect = currentEffect
                currentEffect = null
                value = fn()
                currentEffect = prevEffect
                dirty = false
                console.log('[computed] computed value:', value)
            } else {
                console.log('[computed] clean - returning cached:', value)
            }
            return value
        }
        console.warn('[framework] computed() is read-only')
    }

    return accessor
}

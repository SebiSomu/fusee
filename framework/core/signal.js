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
  // A computed is a read-only signal derived from other signals
  const result = signal(undefined)
  effect(() => result(fn()))
  return result
}

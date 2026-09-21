import { runInSignalScope, getSignalFrame, getSignalRegistry } from './async-context.js'

/** Runs work in a scope whose signal values can be recorded and replayed. */
export function withSignalScope(scopeId, fn) {
    return runInSignalScope(scopeId, fn)
}

/** Returns the active positional signal frame. */
function currentFrame() {
    return getSignalFrame()
}

/** Resolves a signal initializer from hydrated state or records its initial value. */
export function resolveSignalValue(initial) {
    const frame = currentFrame()
    if (!frame) return { value: initial, hydrated: false }

    const registry = getSignalRegistry()
    const idx = frame.index++
    let list = registry.get(frame.scopeId)

    if (list && idx in list) {
        return { value: list[idx], hydrated: true }
    }

    if (!list) {
        list = []
        registry.set(frame.scopeId, list)
    }
    list[idx] = initial
    return { value: initial, hydrated: false }
}

/** Loads server-recorded signal values into the active hydration registry. */
export function loadSignalRegistry(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return
    const registry = getSignalRegistry()
    for (const [scopeId, values] of Object.entries(snapshot)) {
        registry.set(scopeId, values)
    }
}

/** Returns a serializable snapshot of all recorded signal scopes. */
export function extractSignalRegistrySnapshot() {
    const registry = getSignalRegistry()
    const out = {}
    for (const [scopeId, values] of registry) {
        out[scopeId] = values
    }
    return out
}

/** Clears all recorded signal values in the active registry. */
export function clearSignalRegistry() {
    getSignalRegistry().clear()
}
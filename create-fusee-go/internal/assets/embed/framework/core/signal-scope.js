import { runInSignalScope, getSignalFrame, getSignalRegistry } from './async-context.js'

export function withSignalScope(scopeId, fn) {
    return runInSignalScope(scopeId, fn)
}

function currentFrame() {
    return getSignalFrame()
}

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

export function loadSignalRegistry(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return
    const registry = getSignalRegistry()
    for (const [scopeId, values] of Object.entries(snapshot)) {
        registry.set(scopeId, values)
    }
}

export function extractSignalRegistrySnapshot() {
    const registry = getSignalRegistry()
    const out = {}
    for (const [scopeId, values] of registry) {
        out[scopeId] = values
    }
    return out
}

export function clearSignalRegistry() {
    getSignalRegistry().clear()
}
import { getSignalScopeStack, getSignalRegistry } from './async-context.js'

/**
 * The core contract: every setup() call — for a page or a component — runs
 * inside withSignalScope(scopeId, fn). Every signal(initial) call made
 * during that fn() call consumes ONE positional slot in that scope, in
 * strict call order (same rule as React's hooks: no signal() calls inside
 * conditionals/loops that could change the count between renders of the
 * "same" instance).
 *
 * scopeId must be the SAME value on the server and the client for a given
 * component instance — Step 1's compiler already assigns a stable anchor
 * id to every component boundary (`<!--f-component:name:N-->`) in AST
 * traversal order, and the client walks the same AST in the same order,
 * so reusing that id as scopeId costs nothing new to compute.
 */

export function pushSignalScope(scopeId) {
    getSignalScopeStack().push({ scopeId, index: 0 })
}

export function popSignalScope() {
    getSignalScopeStack().pop()
}

export function withSignalScope(scopeId, fn) {
    pushSignalScope(scopeId)
    try {
        return fn()
    } finally {
        popSignalScope()
    }
}

function currentFrame() {
    const stack = getSignalScopeStack()
    return stack.length ? stack[stack.length - 1] : null
}

/**
 * Called by signal() itself. One function serves both directions:
 *
 * - SSR (registry starts empty): no value exists yet at this slot, so we
 *   write `initial` into the registry (building up what will later be
 *   dehydrated) and return { value: initial, hydrated: false }.
 * - Client hydration (registry pre-loaded from window.__FUSEE_STATE__ via
 *   loadSignalRegistry() before setup() runs): a value already exists at
 *   this slot, so we return it instead of `initial` and mark
 *   hydrated: true — the caller (signal.js) uses this to skip recomputing
 *   an expensive initializer or re-running a fetch.
 *
 * Outside any scope (no withSignalScope() active — e.g. a signal created
 * ad hoc, not during a tracked setup()), this is a no-op passthrough:
 * { value: initial, hydrated: false }.
 */
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

/** Client bootstrap: seed the registry from the dehydrated payload before any setup() runs. */
export function loadSignalRegistry(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return
    const registry = getSignalRegistry()
    for (const [scopeId, values] of Object.entries(snapshot)) {
        registry.set(scopeId, values)
    }
}

/** Server-side: read back everything recorded during this request's render, for dehydration. */
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
    getSignalScopeStack().length = 0
}
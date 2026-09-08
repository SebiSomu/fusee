let _als = null

export function _registerALS(als) {
    _als = als
}

export function _getALS() {
    return _als
}

export const _globalInFlightMaps = {
    byKey: new Map(),
    byFetcher: new WeakMap()
}

export function getInFlightStore() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.inFlightMaps
    }
    return _globalInFlightMaps
}

export function isSSRContext() {
    if (!_als) return false
    return _als.getStore() !== undefined
}

// New in Step 2: request-scoped resource-cache registry, mirroring
// getInFlightStore(). hydration.js reads/writes through this instead of
// its old module-level singleton whenever we're inside a request context,
// so concurrent requests never share a resourceKey -> Map(cacheKey -> entry)
// registry. Outside SSR (browser), falls back to a single global registry —
// same behavior as before this change.
const _globalResourceRegistry = {
    caches: []
}

export function getResourceRegistry() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.resourceRegistry
    }
    return _globalResourceRegistry
}

// New in Step 3: request-scoped registry of streaming suspense boundaries,
// same ALS-scoping pattern as inFlightMaps/resourceRegistry above. A
// "boundary" is one out-of-order-streamable chunk of a page (placeholder
// now, real HTML pushed later). The global fallback here exists only so
// calling renderSuspenseBoundary() outside a request context doesn't
// crash — using it that way isn't meaningful (there's no stream to push
// into) and callers should treat that as a misuse to fix, not a
// supported mode.
const _globalStreamBoundaries = { list: [], nextId: 0 }

export function getStreamBoundaryStore() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.streamBoundaries
    }
    return _globalStreamBoundaries
}

// New in Step 4: request-scoped positional signal-state registry, used to
// dehydrate signal() initial values on the server and replay them on the
// client without recomputation. Shape: { stack: [{scopeId, index}], registry: Map<scopeId, value[]> }.
// `stack` tracks which component/page scope is CURRENTLY running its
// setup() so signal() calls made inside it land in the right slot —
// same ALS-per-request isolation as everything above, for the same
// reason (concurrent requests must never share this either).
const _globalSignalScope = { stack: [], registry: new Map() }

export function getSignalScopeStack() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.signalScope.stack
    }
    return _globalSignalScope.stack
}

export function getSignalRegistry() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.signalScope.registry
    }
    return _globalSignalScope.registry
}
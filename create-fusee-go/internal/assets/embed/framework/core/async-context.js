let _als = null
let _scopeALS = null

/** Installs the request AsyncLocalStorage used by server runtimes. */
export function _registerALS(als) {
    _als = als
}

/** Returns the currently installed request AsyncLocalStorage instance. */
export function _getALS() {
    return _als
}

/** Installs the AsyncLocalStorage used for positional signal scopes. */
export function _registerScopeALS(als) {
    _scopeALS = als
}

export const _globalInFlightMaps = {
    byKey: new Map(),
    byFetcher: new WeakMap()
}

/** Returns request-local in-flight maps, or browser-wide fallback maps. */
export function getInFlightStore() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.inFlightMaps
    }
    return _globalInFlightMaps
}

/** Reports whether execution is currently inside a server request context. */
export function isSSRContext() {
    if (!_als) return false
    return _als.getStore() !== undefined
}

const _globalResourceRegistry = {
    caches: []
}

/** Returns the resource cache registry for the active request or browser. */
export function getResourceRegistry() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.resourceRegistry
    }
    return _globalResourceRegistry
}

const _globalStreamBoundaries = { list: [], nextId: 0 }

/** Returns the suspense boundary store for the active request or browser. */
export function getStreamBoundaryStore() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.streamBoundaries
    }
    return _globalStreamBoundaries
}

const _globalSignalScope = { registry: new Map() }

/** Returns the signal hydration registry for the active request or browser. */
export function getSignalRegistry() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.signalScope.registry
    }
    return _globalSignalScope.registry
}

const _fallbackScopeStack = []

/** Runs sync or async work with an isolated positional signal frame. */
export function runInSignalScope(scopeId, fn) {
    const frame = { scopeId, index: 0 }

    if (_scopeALS) {
        return _scopeALS.run(frame, fn)
    }

    _fallbackScopeStack.push(frame)
    const finish = () => {
        const idx = _fallbackScopeStack.lastIndexOf(frame)
        if (idx !== -1) _fallbackScopeStack.splice(idx, 1)
    }

    let result
    try {
        result = fn()
    } catch (err) {
        finish()
        throw err
    }

    if (result && typeof result.then === 'function') {
        return result.then(
            (value) => { finish(); return value },
            (err) => { finish(); throw err }
        )
    }

    finish()
    return result
}

/** Returns the current positional signal frame, if one is active. */
export function getSignalFrame() {
    if (_scopeALS) return _scopeALS.getStore() ?? null
    return _fallbackScopeStack.length ? _fallbackScopeStack[_fallbackScopeStack.length - 1] : null
}
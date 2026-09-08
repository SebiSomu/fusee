let _als = null
let _scopeALS = null

export function _registerALS(als) {
    _als = als
}

export function _getALS() {
    return _als
}

export function _registerScopeALS(als) {
    _scopeALS = als
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

const _globalStreamBoundaries = { list: [], nextId: 0 }

export function getStreamBoundaryStore() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.streamBoundaries
    }
    return _globalStreamBoundaries
}

const _globalSignalScope = { registry: new Map() }

export function getSignalRegistry() {
    if (_als) {
        const ctx = _als.getStore()
        if (ctx) return ctx.signalScope.registry
    }
    return _globalSignalScope.registry
}

const _fallbackScopeStack = []

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

export function getSignalFrame() {
    if (_scopeALS) return _scopeALS.getStore() ?? null
    return _fallbackScopeStack.length ? _fallbackScopeStack[_fallbackScopeStack.length - 1] : null
}
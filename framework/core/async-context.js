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

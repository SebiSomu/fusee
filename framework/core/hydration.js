const _hydrationRegistry = new Map()
const _registeredCaches = []

export function _registerResourceCache(resourceKey, cache) {
    _registeredCaches.push({ resourceKey, cache })
}

export function extractHydrationData() {
    const snapshot = {}

    for (const { resourceKey, cache } of _registeredCaches) {
        const entries = {}
        for (const [cacheKey, entry] of cache) {
            entries[cacheKey] = { data: entry.data, updatedAt: entry.updatedAt }
        }
        if (Object.keys(entries).length > 0) {
            snapshot[resourceKey] = entries
        }
    }

    return snapshot
}

export function dehydrate(snapshot = extractHydrationData()) {
    try {
        const json = JSON.stringify(snapshot)
        return json.replace(/<\/script>/gi, '<\\/script>')
    } catch (err) {
        console.error('[fusée] dehydrate() failed to serialize hydration data:', err)
        return '{}'
    }
}

export function loadHydration(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        console.warn('[fusée] loadHydration() received invalid snapshot')
        return
    }

    for (const [resourceKey, entries] of Object.entries(snapshot)) {
        if (!_hydrationRegistry.has(resourceKey)) {
            _hydrationRegistry.set(resourceKey, new Map())
        }
        const map = _hydrationRegistry.get(resourceKey)
        for (const [cacheKey, entry] of Object.entries(entries)) {
            map.set(cacheKey, { data: entry.data, updatedAt: entry.updatedAt })
        }
    }
}

export function hydrateFromWindow() {
    if (typeof window === 'undefined') return
    const raw = window.__FUSEE_HYDRATION__
    if (raw) loadHydration(raw)
}

export function getHydratedEntries(resourceKey) {
    return _hydrationRegistry.get(resourceKey) ?? null
}

export function isHydrationFresh(resourceKey, cacheKey, staleTime = 0) {
    const entries = _hydrationRegistry.get(resourceKey)
    if (!entries) return false
    const entry = entries.get(cacheKey)
    if (!entry) return false
    return (Date.now() - entry.updatedAt) <= staleTime
}

export function clearHydration() {
    _hydrationRegistry.clear()
    _registeredCaches.length = 0
}

export function getHydrationSnapshot() {
    const out = {}
    for (const [resourceKey, map] of _hydrationRegistry) {
        out[resourceKey] = {}
        for (const [cacheKey, entry] of map) {
            out[resourceKey][cacheKey] = { ...entry }
        }
    }
    return out
}
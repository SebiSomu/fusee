import { getResourceRegistry, isSSRContext } from './async-context.js'
import { extractSignalRegistrySnapshot, loadSignalRegistry } from './signal-scope.js'
import { effect } from './signal.js'
import { findAnchors, flattenAnchors, getBoundTextNode, clearBetween, insertHtmlBefore } from './dom-anchors.js'

const _hydrationRegistry = new Map()
const DATA_SCRIPT_ID = '__FUSEE_DATA__'

export function _registerResourceCache(resourceKey, cache) {
    const registry = getResourceRegistry()
    registry.caches.push({ resourceKey, cache })
}

export function extractHydrationData(ctxOrNothing) {
    const registry = ctxOrNothing?.resourceRegistry ?? getResourceRegistry()
    const snapshot = {}

    for (const { resourceKey, cache } of registry.caches) {
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

export function renderDehydrationScript(ctxOrNothing) {
    const payload = {
        resources: extractHydrationData(ctxOrNothing),
        signals: extractSignalRegistrySnapshot()
    }

    let json
    try {
        json = JSON.stringify(payload).replace(/<\/script/gi, '<\\/script')
    } catch (err) {
        console.error('[fusée] renderDehydrationScript() failed to serialize state:', err)
        json = '{}'
    }

    return `<script id="${DATA_SCRIPT_ID}">window.__FUSEE_STATE__ = ${json};</script>`
}

export function readWindowState() {
    if (typeof window === 'undefined') return null
    const state = window.__FUSEE_STATE__
    if (!state || typeof state !== 'object') return null
    return state
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

    const state = readWindowState()
    if (state) {
        if (state.resources) loadHydration(state.resources)
        if (state.signals) loadSignalRegistry(state.signals)
        return
    }

    const legacy = window.__FUSEE_HYDRATION__
    if (legacy) loadHydration(legacy)
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

export function hydrateAnchors(root, bindings = []) {
    const anchors = flattenAnchors(findAnchors(root))
    const cleanups = []

    anchors.forEach((anchor, i) => {
        const spec = bindings[i]
        if (!spec) return

        if (anchor.type === 'f-bind' && spec.type === 'bind') {
            cleanups.push(hydrateTextBinding(anchor, spec.get))
        } else if (anchor.type === 'element' && spec.type === 'attrs') {
            cleanups.push(hydrateElementAttrs(anchor.element, spec.get))
        } else if (anchor.type === 'f-if' && spec.type === 'if') {
            cleanups.push(hydrateIfBinding(anchor, spec.branches))
        }
    })

    return () => cleanups.forEach(c => typeof c === 'function' && c())
}

function hydrateTextBinding(anchor, get) {
    const textNode = getBoundTextNode(anchor)
    if (!textNode) return null
    return effect(() => {
        textNode.textContent = String(get() ?? '')
    })
}

function hydrateElementAttrs(element, get) {
    return effect(() => {
        const attrs = get() ?? {}
        for (const [name, value] of Object.entries(attrs)) {
            if (value === false || value == null) element.removeAttribute(name)
            else if (value === true) element.setAttribute(name, '')
            else element.setAttribute(name, String(value))
        }
    })
}

function hydrateIfBinding(anchor, branches) {
    let activeIndex = -1
    return effect(() => {
        const nextIndex = branches.findIndex(b => b.cond())
        if (nextIndex === activeIndex) return
        activeIndex = nextIndex
        clearBetween(anchor.startNode, anchor.endNode)
        if (nextIndex !== -1) {
            insertHtmlBefore(anchor.endNode, branches[nextIndex].render())
        }
    })
}
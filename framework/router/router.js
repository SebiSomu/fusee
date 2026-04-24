import { signal } from '../core/signal.js'

export const currentRoute = signal('/')
export const routeParams = signal({})
export const matchedRoutes = signal([])

let _routes = []
let _rootOutlet = null
let _clickHandler = null
let _activeChain = []
let _routeCache = new Map()
let _cacheMaxSize = 100
let _routerViewTimeout = 10000

function _getPath() {
    return window.location.pathname || '/'
}

function _getRoutePaths(routePath) {
    return Array.isArray(routePath) ? routePath : [routePath]
}

function _updateRoute() {
    currentRoute(_getPath())
}

function _matchSegments(routePath, urlSegments) {
    const cleanPath = routePath.startsWith('/') ? routePath.slice(1) : routePath

    if (cleanPath === '') {
        return { matched: true, consumed: 0, params: {} }
    }

    if (cleanPath === '*') {
        return { matched: true, consumed: urlSegments.length, params: {} }
    }

    const routeSegs = cleanPath.split('/').filter(Boolean)
    const hasWildcard = routeSegs[routeSegs.length - 1] === '*'
    const checkSegs = hasWildcard ? routeSegs.slice(0, -1) : routeSegs

    if (hasWildcard) {
        if (urlSegments.length < checkSegs.length) return null
    }

    if (urlSegments.length < checkSegs.length) return null

    const params = {}
    for (let i = 0; i < checkSegs.length; i++) {
        const rSeg = checkSegs[i]
        const uSeg = urlSegments[i]
        if (rSeg.startsWith(':')) {
            params[rSeg.slice(1)] = uSeg
        } else if (rSeg !== uSeg) {
            return null
        }
    }

    const consumed = hasWildcard ? urlSegments.length : checkSegs.length
    return { matched: true, consumed, params }
}

function _matchRouteTree(routes, urlSegments) {
    for (const route of routes) {
        const paths = _getRoutePaths(route.path)
        for (const path of paths) {
            const result = _matchSegments(path, urlSegments)
            if (!result) continue

            const remaining = urlSegments.slice(result.consumed)

            if (route.children && route.children.length > 0) {
                const childChain = _matchRouteTree(route.children, remaining)
                if (childChain) {
                    return [
                        { route, params: result.params, matchedSegments: urlSegments.slice(0, result.consumed), matchedPath: path },
                        ...childChain
                    ]
                }
                continue
            }

            if (remaining.length === 0 || path === '*' || path.endsWith('/*')) {
                return [{ route, params: result.params, matchedSegments: urlSegments.slice(0, result.consumed), matchedPath: path }]
            }
        }
    }

    return null
}

function _matchSingleFlat(routePath, actualPath) {
    if (routePath === '*') return true

    const routeParts = routePath.split('/').filter(Boolean)
    const actualParts = actualPath.split('/').filter(Boolean)

    const hasWildcard = routeParts.length > 0 && routeParts[routeParts.length - 1] === '*'

    if (hasWildcard) {
        const baseParts = routeParts.slice(0, -1)
        if (actualParts.length < baseParts.length) return false
        return baseParts.every((part, i) => part.startsWith(':') || part === actualParts[i])
    }

    if (routeParts.length !== actualParts.length) return false
    return routeParts.every((part, i) => part.startsWith(':') || part === actualParts[i])
}

function _matchFlat(routePath, actualPath) {
    const paths = _getRoutePaths(routePath)
    return paths.some(p => _matchSingleFlat(p, actualPath))
}

function _findMatchingPath(routePath, actualPath) {
    const paths = _getRoutePaths(routePath)
    return paths.find(p => _matchSingleFlat(p, actualPath)) || null
}

function _extractParamsFromPath(singlePath, actualPath) {
    const params = {}
    if (singlePath === '*') return params

    const routeParts = singlePath.split('/').filter(Boolean)
    const actualParts = actualPath.split('/').filter(Boolean)

    const hasWildcard = routeParts.length > 0 && routeParts[routeParts.length - 1] === '*'
    const checkLen = hasWildcard ? routeParts.length - 1 : routeParts.length

    for (let i = 0; i < checkLen; i++) {
        if (routeParts[i] && routeParts[i].startsWith(':')) {
            params[routeParts[i].slice(1)] = actualParts[i] || ''
        }
    }
    return params
}

function _extractParamsFlat(routePath, actualPath) {
    const matchingPath = _findMatchingPath(routePath, actualPath)
    if (!matchingPath) return {}
    return _extractParamsFromPath(matchingPath, actualPath)
}

function _findMatchingChain(path) {
    if (_routeCache.has(path)) {
        const cached = _routeCache.get(path)
        _routeCache.delete(path)
        _routeCache.set(path, cached)
        return cached
    }

    const urlSegments = path.split('/').filter(Boolean)
    const hasNested = _routes.some(r => r.children && r.children.length > 0)

    let chain = null

    if (hasNested) {
        chain = _matchRouteTree(_routes, urlSegments)
        if (chain) {
            _cacheResult(path, chain)
            return chain
        }
    }

    const paths = _routes.filter(r => {
        const routePaths = _getRoutePaths(r.path)
        return !routePaths.includes('*') && !routePaths.some(p => p.endsWith('/*')) && !r.children
    })
    const exactMatch = paths.find(r => _matchFlat(r.path, path))
    if (exactMatch) {
        const matchedPath = _findMatchingPath(exactMatch.path, path)
        chain = [{ route: exactMatch, params: _extractParamsFlat(exactMatch.path, path), matchedSegments: urlSegments, matchedPath }]
        _cacheResult(path, chain)
        return chain
    }

    const wildcardPaths = _routes.filter(r => {
        const routePaths = _getRoutePaths(r.path)
        return !r.children && routePaths.some(p => p.endsWith('/*'))
    })
    const wildcardMatch = wildcardPaths.find(r => _matchFlat(r.path, path))
    if (wildcardMatch) {
        const matchedPath = _findMatchingPath(wildcardMatch.path, path)
        chain = [{ route: wildcardMatch, params: _extractParamsFlat(wildcardMatch.path, path), matchedSegments: urlSegments, matchedPath }]
        _cacheResult(path, chain)
        return chain
    }

    const catchAll = _routes.find(r => {
        const routePaths = _getRoutePaths(r.path)
        return routePaths.includes('*')
    })
    if (catchAll) {
        chain = [{ route: catchAll, params: {}, matchedSegments: urlSegments, matchedPath: '*' }]
        _cacheResult(path, chain)
        return chain
    }

    return null
}

function _cacheResult(path, chain) {
    if (_routeCache.size >= _cacheMaxSize) {
        const firstKey = _routeCache.keys().next().value
        _routeCache.delete(firstKey)
    }
    _routeCache.set(path, chain)
}

function _clearRouteCache() {
    _routeCache.clear()
}

function _unmountFromLevel(level) {
    for (let i = _activeChain.length - 1; i >= level; i--) {
        const entry = _activeChain[i]
        if (entry && entry.instance) {
            try { entry.instance.unmount() } catch { }
        }
    }
    _activeChain.length = level
}

function _getRoutePathCount(route) {
    return Array.isArray(route.path) ? route.path.length : 1
}

function _renderChain(chain) {
    try {
        let reuseUntil = 0
        for (let i = 0; i < Math.min(_activeChain.length, chain.length); i++) {
            const active = _activeChain[i]
            const incoming = chain[i]

            if (
                active.route === incoming.route &&
                _segmentsEqual(active.matchedSegments, incoming.matchedSegments)
            ) {
                reuseUntil = i + 1
            }
            else if (
                active.route === incoming.route &&
                _getRoutePathCount(active.route) > 1
            ) {
                reuseUntil = i + 1
            }
            else {
                break
            }
        }

        _unmountFromLevel(reuseUntil)

        const allParams = {}
        for (const entry of chain) {
            Object.assign(allParams, entry.params)
        }
        routeParams(allParams)
        matchedRoutes(chain.map(e => e.route))
        _renderFromLevel(chain, reuseUntil)
    } catch (error) {
        console.error('[framework] Error rendering route chain:', error)
        _unmountFromLevel(0)
        if (_rootOutlet) {
            _rootOutlet.innerHTML = `<p style="color:red">[framework] Error rendering route: ${error.message}</p>`
        }
    }
}

function _renderFromLevel(chain, level) {
    if (level >= chain.length) return

    const entry = chain[level]
    const outlet = _getOutletForLevel(level)

    if (!outlet) {
        _waitForRouterView(level, () => _renderFromLevel(chain, level))
        return
    }

    outlet.innerHTML = ''

    const componentFn = entry.route.component
    const instance = componentFn()
    instance.render(outlet)

    _activeChain[level] = {
        route: entry.route,
        matchedSegments: entry.matchedSegments,
        params: entry.params,
        instance,
        outlet
    }

    if (level + 1 < chain.length) _scheduleNextLevel(chain, level + 1)
}

function _scheduleNextLevel(chain, level) {
    const outlet = _getOutletForLevel(level)
    if (outlet) {
        _renderFromLevel(chain, level)
        return
    }

    _waitForRouterView(level, () => _renderFromLevel(chain, level))
}

function _getOutletForLevel(level) {
    if (level === 0) return _rootOutlet

    const parentEntry = _activeChain[level - 1]
    if (!parentEntry || !parentEntry.outlet) return null

    return parentEntry.outlet.querySelector('[data-router-view]')
}

function _waitForRouterView(level, callback) {
    const parentEntry = _activeChain[level - 1]
    if (!parentEntry || !parentEntry.outlet) return

    const parentOutlet = parentEntry.outlet

    const existing = parentOutlet.querySelector('[data-router-view]')
    if (existing) {
        callback()
        return
    }

    const observer = new MutationObserver(() => {
        const el = parentOutlet.querySelector('[data-router-view]')
        if (el) {
            observer.disconnect()
            callback()
        }
    })

    observer.observe(parentOutlet, { childList: true, subtree: true })

    setTimeout(() => observer.disconnect(), _routerViewTimeout)
}

function _segmentsEqual(a, b) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

function _resolveRoute() {
    if (!_rootOutlet || _routes.length === 0) return

    const path = _getPath()
    const chain = _findMatchingChain(path)

    if (!chain) {
        _unmountFromLevel(0)
        _rootOutlet.innerHTML = `<p style="color:red">[framework] No route matched for "${path}"</p>`
        routeParams({})
        matchedRoutes([])
        return
    }

    _renderChain(chain)
}

export function navigate(path) {
    if (path === _getPath()) return
    window.history.pushState({}, '', path)
    _updateRoute()
    _resolveRoute()
}

export function mountOutlet(el) {
    _rootOutlet = el
    _resolveRoute()
}

function _isInternalLink(anchor) {
    const href = anchor.getAttribute('href')
    if (!href) return false
    if (href.startsWith('#')) return false
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
        const url = new URL(href, window.location.origin)
        return url.origin === window.location.origin
    }
    return href.startsWith('/')
}

function _getAnchorFromEvent(e) {
    if (e.composedPath) {
        return e.composedPath().find(el => el.tagName === 'A')
    }
    return e.target.tagName === 'A' ? e.target : null
}

function _handleLinkClick(e) {
    const anchor = _getAnchorFromEvent(e)
    if (!anchor) return

    if (anchor.hasAttribute('f-link') || _isInternalLink(anchor)) {
        e.preventDefault()
        const href = anchor.getAttribute('href')
        if (href && href !== _getPath()) {
            navigate(href)
        }
    }
}

function _setupPopstateHandler() {
    const handler = () => {
        _updateRoute()
        _resolveRoute()
    }
    window.addEventListener('popstate', handler)
    return handler
}

function _setupClickHandler() {
    _clickHandler = _handleLinkClick
    document.addEventListener('click', _clickHandler)
    return _clickHandler
}

function _setupInitialRoute() {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            _updateRoute()
            _resolveRoute()
        }, { once: true })
    } else {
        setTimeout(() => {
            if (_activeChain.length === 0) _resolveRoute()
        }, 0)
    }
}

export function createRouter(routes, options = {}) {
    _routes = routes
    _activeChain = []
    _cacheMaxSize = options.cacheSize || 100
    _routerViewTimeout = options.routerViewTimeout || 10000

    _updateRoute()

    const popstateHandler = _setupPopstateHandler()
    _setupClickHandler()
    _setupInitialRoute()

    return {
        navigate,
        destroy() {
            window.removeEventListener('popstate', popstateHandler)
            document.removeEventListener('click', _clickHandler)
            _unmountFromLevel(0)
            _routes = []
            _rootOutlet = null
            _activeChain = []
            _clearRouteCache()
        }
    }
}

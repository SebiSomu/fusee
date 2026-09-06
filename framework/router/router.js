import { signal } from '../core/signal.js'

export const currentRoute = signal('/')
export const routeParams = signal({})
export const routeQuery = signal({})
export const matchedRoutes = signal([])
export const routeMeta = signal({})

let _routes = []
let _rootOutlet = null
let _clickHandler = null
let _activeChain = []
let _routeCache = new Map()
let _cacheMaxSize = 100
let _routerViewTimeout = 10000
let _scrollBehaviorOptions = null
let _scrollPositions = new Map()
let _currentPath = null
let _beforeEachGuards = []
let _afterEachGuards = []
let _globalMiddleware = []
let _errorHandlers = []
const _MAX_REDIRECTS = 10

function _getPath() {
    const pathname = window.location.pathname || '/'
    const search = window.location.search || ''
    const hash = window.location.hash || ''
    return pathname + search + hash
}

function _extractQuery(path) {
    const queryStr = path.split('?')[1]?.split('#')[0]
    if (!queryStr) return {}
    const params = new URLSearchParams(queryStr)
    const query = {}
    for (const [key, value] of params.entries()) {
        query[key] = value
    }
    return query
}

function _getRoutePaths(routePath) {
    return Array.isArray(routePath) ? routePath : [routePath]
}

function _updateRoute() {
    currentRoute(_getPath())
}

export function beforeEach(guard) {
    _beforeEachGuards.push(guard)
    return function unregister() {
        const idx = _beforeEachGuards.indexOf(guard)
        if (idx > -1) _beforeEachGuards.splice(idx, 1)
    }
}

export function afterEach(hook) {
    _afterEachGuards.push(hook)
    return function unregister() {
        const idx = _afterEachGuards.indexOf(hook)
        if (idx > -1) _afterEachGuards.splice(idx, 1)
    }
}

export function use(middleware) {
    _globalMiddleware.push(middleware)
    return function unregister() {
        const idx = _globalMiddleware.indexOf(middleware)
        if (idx > -1) _globalMiddleware.splice(idx, 1)
    }
}

export function onError(handler) {
    _errorHandlers.push(handler)
    return function unregister() {
        const idx = _errorHandlers.indexOf(handler)
        if (idx > -1) _errorHandlers.splice(idx, 1)
    }
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
    const actualPathWithoutParams = actualPath.split(/[?#]/)[0]
    const routeParts = routePath.split('/').filter(Boolean)
    const actualParts = actualPathWithoutParams.split('/').filter(Boolean)

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

    const actualPathWithoutParams = actualPath.split(/[?#]/)[0]
    const routeParts = singlePath.split('/').filter(Boolean)
    const actualParts = actualPathWithoutParams.split('/').filter(Boolean)

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
    const pathWithoutParams = path.split(/[?#]/)[0]

    if (_routeCache.has(pathWithoutParams)) {
        const cached = _routeCache.get(pathWithoutParams)
        _routeCache.delete(pathWithoutParams)
        _routeCache.set(pathWithoutParams, cached)
        return cached
    }

    const urlSegments = pathWithoutParams.split('/').filter(Boolean)
    const hasNested = _routes.some(r => r.children && r.children.length > 0)

    let chain = null

    if (hasNested) {
        chain = _matchRouteTree(_routes, urlSegments)
        if (chain) {
            _cacheResult(pathWithoutParams, chain)
            return chain
        }
    }

    const paths = _routes.filter(r => {
        const routePaths = _getRoutePaths(r.path)
        return !routePaths.includes('*') && !routePaths.some(p => p.endsWith('/*')) && !r.children
    })
    const exactMatch = paths.find(r => _matchFlat(r.path, pathWithoutParams))
    if (exactMatch) {
        const matchedPath = _findMatchingPath(exactMatch.path, pathWithoutParams)
        chain = [{ route: exactMatch, params: _extractParamsFlat(exactMatch.path, pathWithoutParams), matchedSegments: urlSegments, matchedPath }]
        _cacheResult(pathWithoutParams, chain)
        return chain
    }

    const wildcardPaths = _routes.filter(r => {
        const routePaths = _getRoutePaths(r.path)
        return !r.children && routePaths.some(p => p.endsWith('/*'))
    })
    const wildcardMatch = wildcardPaths.find(r => _matchFlat(r.path, pathWithoutParams))
    if (wildcardMatch) {
        const matchedPath = _findMatchingPath(wildcardMatch.path, pathWithoutParams)
        chain = [{ route: wildcardMatch, params: _extractParamsFlat(wildcardMatch.path, pathWithoutParams), matchedSegments: urlSegments, matchedPath }]
        _cacheResult(pathWithoutParams, chain)
        return chain
    }

    const catchAll = _routes.find(r => {
        const routePaths = _getRoutePaths(r.path)
        return routePaths.includes('*')
    })
    if (catchAll) {
        chain = [{ route: catchAll, params: {}, matchedSegments: urlSegments, matchedPath: '*' }]
        _cacheResult(pathWithoutParams, chain)
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

function _buildToLocation(fullPath, chain) {
    const params = {}
    for (const entry of chain) Object.assign(params, entry.params)
    return {
        path: fullPath.split(/[?#]/)[0],
        fullPath,
        params,
        query: _extractQuery(fullPath),
        matched: chain.map(e => e.route)
    }
}

function _buildFromLocation(fullPath) {
    return {
        path: fullPath ? fullPath.split(/[?#]/)[0] : null,
        fullPath: fullPath ?? null,
        params: routeParams(),
        query: routeQuery(),
        matched: matchedRoutes()
    }
}

function _normalizeGuardResult(result) {
    if (result === false) return { type: 'cancel' }
    if (typeof result === 'string') return { type: 'redirect', path: result, replace: false }
    if (result && typeof result === 'object' && typeof result.path === 'string') {
        return { type: 'redirect', path: result.path, replace: !!result.replace }
    }
    return { type: 'allow' }
}

async function _runGuardList(guards, to, from) {
    for (const guard of guards) {
        if (typeof guard !== 'function') continue
        let result
        try {
            result = await guard(to, from)
        } catch (err) {
            console.error('[framework] Navigation guard threw:', err)
            return { type: 'cancel' }
        }
        const normalized = _normalizeGuardResult(result)
        if (normalized.type !== 'allow') return normalized
    }
    return { type: 'allow' }
}

async function _runAllGuards(to, from, chain) {
    const globalResult = await _runGuardList(_beforeEachGuards, to, from)
    if (globalResult.type !== 'allow') return globalResult

    for (const entry of chain) {
        const raw = entry.route.beforeEnter
        if (!raw) continue
        const routeGuards = Array.isArray(raw) ? raw : [raw]
        const result = await _runGuardList(routeGuards, to, from)
        if (result.type !== 'allow') return result
    }

    return { type: 'allow' }
}

function _runAfterHooks(to, from) {
    for (const hook of _afterEachGuards) {
        try { hook(to, from) } catch (err) {
            console.error('[framework] afterEach hook threw:', err)
        }
    }
}

function _flattenMiddleware(chain) {
    const list = [..._globalMiddleware]
    for (const entry of chain) {
        const raw = entry.route.middleware
        if (!raw) continue
        list.push(...(Array.isArray(raw) ? raw : [raw]))
    }
    return list.filter(mw => typeof mw === 'function')
}

async function _runMiddlewarePipeline(list, ctx) {
    let index = -1

    async function dispatch(i) {
        if (i <= index) {
            console.warn('[framework] middleware called next() multiple times')
            return
        }
        index = i
        if (i >= list.length) return
        const mw = list[i]
        await mw(ctx, () => dispatch(i + 1))
    }

    await dispatch(0)
    return index >= list.length - 1
}

function _reportMiddlewareError(err, to, from) {
    if (_errorHandlers.length === 0) {
        console.error('[framework] Unhandled error in router middleware:', err)
        return
    }
    for (const handler of _errorHandlers) {
        try { handler(err, to, from) } catch (nestedErr) {
            console.error('[framework] Error handler itself threw:', nestedErr)
        }
    }
}

function _saveScrollPosition(path) {
    if (!_scrollBehaviorOptions?.saveScrollPosition) return
    _scrollPositions.set(path, {
        left: window.scrollX,
        top: window.scrollY
    })
}

function _getSavedScrollPosition(path) {
    return _scrollPositions.get(path) || null
}

function _applyScrollBehavior(to, from) {
    const options = _scrollBehaviorOptions
    if (!options) return

    const savedPosition = _getSavedScrollPosition(to)

    if (options.custom) {
        const result = options.custom(to, from, savedPosition)
        if (result && typeof result.then === 'function') {
            result.then(pos => _performScroll(pos))
        } else {
            _performScroll(result)
        }
        return
    }

    if (options.scrollToAnchor && to.includes('#')) {
        const anchor = to.split('#')[1]
        const element = document.getElementById(anchor)
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' })
            return
        }
    }

    if (options.scrollToTop !== false) {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
    } else if (savedPosition && options.saveScrollPosition) {
        window.scrollTo(savedPosition.left, savedPosition.top)
    }
}

function _performScroll(position) {
    if (!position || position === false) return

    if (typeof position === 'object' && 'selector' in position) {
        const element = document.querySelector(position.selector)
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' })
        }
    } else if (typeof position === 'object' && 'left' in position) {
        window.scrollTo({ left: position.left, top: position.top, behavior: 'smooth' })
    }
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

function _finalizeNavigation(path, chain, to, from, historyMode, meta = {}) {
    if (historyMode === 'push') window.history.pushState({}, '', path)
    else if (historyMode === 'replace') window.history.replaceState({}, '', path)

    _renderChain(chain)
    _currentPath = path
    _applyScrollBehavior(path, from.fullPath)
    routeQuery(_extractQuery(path))
    routeMeta(meta)
    _runAfterHooks(to, from)
}

async function _resolveRoute(_redirectDepth = 0) {
    if (!_rootOutlet || _routes.length === 0) return

    const path = _getPath()
    const chain = _findMatchingChain(path)
    const fromFullPath = _currentPath
    const from = _buildFromLocation(fromFullPath)

    if (!chain) {
        _unmountFromLevel(0)
        _rootOutlet.innerHTML = `<p style="color:red">[framework] No route matched for "${path}"</p>`
        routeParams({})
        matchedRoutes([])
        _currentPath = path
        return
    }

    const to = _buildToLocation(path, chain)
    const result = await _runAllGuards(to, from, chain)

    if (result.type === 'cancel') {
        if (fromFullPath !== null && fromFullPath !== path) {
            window.history.pushState({}, '', fromFullPath)
        }
        return
    }

    if (result.type === 'redirect') {
        if (_redirectDepth >= _MAX_REDIRECTS) {
            console.error(`[framework] Aborting navigation guard redirect loop at "${result.path}"`)
            return
        }
        window.history.replaceState({}, '', result.path)
        return _resolveRoute(_redirectDepth + 1)
    }

    const middlewareList = _flattenMiddleware(chain)
    const ctx = { to, from, meta: {} }
    let completed = true
    try {
        completed = await _runMiddlewarePipeline(middlewareList, ctx)
    } catch (err) {
        _reportMiddlewareError(err, to, from)
        return
    }
    if (!completed) return

    _finalizeNavigation(path, chain, to, from, 'none', ctx.meta)
}

export async function navigate(path, options = {}, _redirectDepth = 0) {
    const currentFullPath = _getPath()
    const currentPathOnly = currentFullPath.split(/[?#]/)[0]
    const targetPathOnly = path.split(/[?#]/)[0]

    if (targetPathOnly === currentPathOnly && path === currentFullPath) {
        _applyScrollBehavior(path, currentFullPath)
        return
    }

    const chain = _rootOutlet ? _findMatchingChain(path) : null

    if (chain) {
        const to = _buildToLocation(path, chain)
        const from = _buildFromLocation(currentFullPath)
        const result = await _runAllGuards(to, from, chain)

        if (result.type === 'cancel') return

        if (result.type === 'redirect') {
            if (_redirectDepth >= _MAX_REDIRECTS) {
                console.error(`[framework] Aborting navigation guard redirect loop at "${result.path}"`)
                return
            }
            return navigate(result.path, { replace: true }, _redirectDepth + 1)
        }

        const middlewareList = _flattenMiddleware(chain)
        const ctx = { to, from, meta: {} }
        let completed = true
        try {
            completed = await _runMiddlewarePipeline(middlewareList, ctx)
        } catch (err) {
            _reportMiddlewareError(err, to, from)
            return
        }
        if (!completed) return

        _saveScrollPosition(currentFullPath)
        _finalizeNavigation(path, chain, to, from, options.replace ? 'replace' : 'push', ctx.meta)
        return
    }

    _saveScrollPosition(currentFullPath)
    window.history[options.replace ? 'replaceState' : 'pushState']({}, '', path)
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
    _scrollBehaviorOptions = options.scrollBehavior || null

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
            _scrollPositions.clear()
            _scrollBehaviorOptions = null
            _currentPath = null
            _beforeEachGuards = []
            _afterEachGuards = []
            _globalMiddleware = []
            _errorHandlers = []
        }
    }
}
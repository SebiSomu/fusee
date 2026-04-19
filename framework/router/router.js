import { signal } from '../core/signal.js'

let _routes = []
let _outlet = null
let _currentInstance = null
let _clickHandler = null

export const currentRoute = signal('/')
export const routeParams = signal({})

function _getPath() {
    return window.location.pathname || '/'
}

function _updateRoute() {
    const path = _getPath()
    currentRoute(path)
}

function _matchPath(routePath, actualPath) {
    if (routePath === '*') return true

    const routeParts = routePath.split('/').filter(Boolean)
    const actualParts = actualPath.split('/').filter(Boolean)

    const hasWildcard = routeParts.length > 0 && routeParts[routeParts.length - 1] === '*'
    
    if (hasWildcard) {
        const baseParts = routeParts.slice(0, -1)
        if (actualParts.length < baseParts.length) return false
        return baseParts.every((part, i) =>
            part.startsWith(':') || part === actualParts[i]
        )
    }

    if (routeParts.length !== actualParts.length) return false

    return routeParts.every((part, i) =>
        part.startsWith(':') || part === actualParts[i]
    )
}

function _extractParams(routePath, actualPath) {
    const params = {}
    if (routePath === '*') return params

    const routeParts = routePath.split('/').filter(Boolean)
    const actualParts = actualPath.split('/').filter(Boolean)

    const hasWildcard = routeParts.length > 0 && routeParts[routeParts.length - 1] === '*'
    const checkLength = hasWildcard ? routeParts.length - 1 : routeParts.length

    for (let i = 0; i < checkLength; i++) {
        const routePart = routeParts[i]
        if (routePart && routePart.startsWith(':')) {
            const paramName = routePart.slice(1)
            params[paramName] = actualParts[i] || ''
        }
    }

    return params
}

function _findMatchingRoute(path) {
    const exactMatch = _routes.find(r => 
        r.path !== '*' && 
        !r.path.endsWith('/*') && 
        _matchPath(r.path, path)
    )
    if (exactMatch) return exactMatch

    const wildcardMatch = _routes.find(r => 
        r.path.endsWith('/*') && 
        _matchPath(r.path, path)
    )
    if (wildcardMatch) return wildcardMatch

    const catchAll = _routes.find(r => r.path === '*')
    if (catchAll) return catchAll

    return null
}

function _unmountCurrent() {
    if (_currentInstance) {
        try { _currentInstance.unmount() } catch { }
    }
}

function _renderRoute(matchedRoute, path) {
    _unmountCurrent()
    _outlet.innerHTML = ''

    // Extract and update route params
    const params = _extractParams(matchedRoute.path, path)
    routeParams(params)

    const componentFn = matchedRoute.component
    _currentInstance = componentFn()
    _currentInstance.render(_outlet)
}

function _renderNotFound(path) {
    _outlet.innerHTML = `<p style="color:red">[framework] No route matched for "${path}"</p>`
}

function _resolveRoute() {
    if (!_outlet || _routes.length === 0) return

    const path = _getPath()
    const matched = _findMatchingRoute(path)

    if (!matched) {
        _renderNotFound(path)
        routeParams({})
        return
    }

    _renderRoute(matched, path)
}

export function navigate(path) {
    if (path === _getPath()) return
    window.history.pushState({}, '', path)
    _updateRoute()
    _resolveRoute()
}

export function mountOutlet(el) {
    _outlet = el
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
            if (!_currentInstance) _resolveRoute()
        }, 0)
    }
}

export function createRouter(routes) {
    _routes = routes

    _updateRoute()

    const popstateHandler = _setupPopstateHandler()
    _setupClickHandler()
    _setupInitialRoute()

    return {
        navigate,
        destroy() {
            window.removeEventListener('popstate', popstateHandler)
            document.removeEventListener('click', _clickHandler)
            _unmountCurrent()
            _routes = []
            _outlet = null
            _currentInstance = null
        }
    }
}

import { signal, effect } from '../core/signal.js'

let _routes = []
let _outlet = null
let _currentInstance = null
let _clickHandler = null

export const currentRoute = signal('/')

function _getPath() {
    return window.location.pathname || '/'
}

function _updateRoute() {
    const path = _getPath()
    currentRoute(path)
}

export function createRouter(routes) {
    _routes = routes

    _updateRoute()

    const popstateHandler = () => {
        _updateRoute()
        _resolve()
    }
    window.addEventListener('popstate', popstateHandler)

    _clickHandler = (e) => {
        const anchor = e.composedPath ? e.composedPath().find(el => el.tagName === 'A') : null
        if (!anchor && e.target.tagName === 'A') {
            const target = e.target
            if (target.hasAttribute('f-link') || _isInternalLink(target)) {
                e.preventDefault()
                const href = target.getAttribute('href')
                if (href && href !== _getPath()) {
                    navigate(href)
                }
            }
        } else if (anchor) {
            if (anchor.hasAttribute('f-link') || _isInternalLink(anchor)) {
                e.preventDefault()
                const href = anchor.getAttribute('href')
                if (href && href !== _getPath()) {
                    navigate(href)
                }
            }
        }
    }
    document.addEventListener('click', _clickHandler)

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            _updateRoute()
            _resolve()
        }, { once: true })
    } else {
        setTimeout(() => {
            if (!_currentInstance) _resolve()
        }, 0)
    }

    return {
        navigate,
        destroy() {
            window.removeEventListener('popstate', popstateHandler)
            document.removeEventListener('click', _clickHandler)
            if (_currentInstance) {
                try {
                    _currentInstance.unmount()
                } catch { }
            }
            _routes = []
            _outlet = null
            _currentInstance = null
        }
    }
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

export function navigate(path) {
    if (path === _getPath()) return
    window.history.pushState({}, '', path)
    _updateRoute()
    _resolve()
}

export function mountOutlet(el) {
    _outlet = el
    _resolve()
}

function _resolve() {
    if (!_outlet || _routes.length === 0) {
        return
    }

    const path = _getPath()

    const matched = _routes.find(r => _matchPath(r.path, path))

    if (!matched) {
        _outlet.innerHTML = `<p style="color:red">[framework] No route matched for "${path}"</p>`
        return
    }

    if (_currentInstance) {
        try { _currentInstance.unmount() } catch { }
    }

    _outlet.innerHTML = ''

    const componentFn = matched.component
    _currentInstance = componentFn()
    _currentInstance.render(_outlet)
}

function _matchPath(routePath, actualPath) {
    const routeParts = routePath.split('/').filter(Boolean)
    const actualParts = actualPath.split('/').filter(Boolean)

    if (routeParts.length !== actualParts.length) return false

    return routeParts.every((part, i) =>
        part.startsWith(':') || part === actualParts[i]
    )
}

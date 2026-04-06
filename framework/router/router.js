let _routes = []
let _outlet = null
let _currentInstance = null

export function createRouter(routes) {
    _routes = routes

    const handler = () => _resolve()
    window.addEventListener('hashchange', handler)

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', handler, { once: true })
    } else {
        setTimeout(() => {
            if (!_currentInstance) _resolve()
        }, 0)
    }

    return {
        navigate,
        destroy() {
            window.removeEventListener('hashchange', handler)
            window.removeEventListener('DOMContentLoaded', handler)
            if (_currentInstance) {
                try { 
                    _currentInstance.unmount() 
                } catch {}
            }
            _routes = []
            _outlet = null
            _currentInstance = null
        }
    }
}

export function navigate(path) {
    window.location.hash = path
}

export function mountOutlet(el) {
    _outlet = el
    _resolve()
}

function _resolve() {
    if (!_outlet || _routes.length === 0) {
        return
    }

    const hash = window.location.hash
    const path = hash.startsWith('#') ? hash.slice(1) || '/' : '/'

    const matched = _routes.find(r => _matchPath(r.path, path))

    if (!matched) {
        _outlet.innerHTML = `<p style="color:red">[framework] No route matched for "${path}"</p>`
        return
    }

    if (_currentInstance) {
        try { _currentInstance.unmount() } catch {}
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

// ─── Hash-based SPA Router ────────────────────────────────────────────────────
// Routes are declared as: { path: '/about', component: AboutComponent }
// Navigation via <a href="#/about"> or router.navigate('/about')

let _routes = []
let _outlet = null
let _currentInstance = null

export function createRouter(routes) {
    console.log('[router] creating router with routes:', routes.map(r => r.path))
    _routes = routes

    const handler = () => _resolve()
    window.addEventListener('hashchange', handler)

    if (document.readyState === 'loading') {
        console.log('[router] DOM still loading, waiting for DOMContentLoaded')
        window.addEventListener('DOMContentLoaded', handler)
    } else {
        console.log('[router] DOM ready, resolving immediately')
        _resolve()
    }

    return {
        navigate,
        destroy() {
            console.log('[router] destroying router, cleaning up...')
            window.removeEventListener('hashchange', handler)
            window.removeEventListener('DOMContentLoaded', handler)
            if (_currentInstance) {
                try { 
                    console.log('[router] unmounting current instance')
                    _currentInstance.unmount() 
                } catch {}
            }
            _routes = []
            _outlet = null
            _currentInstance = null
            console.log('[router] cleanup complete')
        }
    }
}

export function navigate(path) {
    console.log('[router] navigating to:', path)
    window.location.hash = path
}

// ── Mount outlet ──────────────────────────────────────────────────────────────
// Call this with the DOM element that acts as <router-outlet>
export function mountOutlet(el) {
    console.log('[router] mounting outlet:', el)
    _outlet = el
    _resolve()
}

// ── Internal resolution ───────────────────────────────────────────────────────
function _resolve() {
    if (!_outlet) {
        console.log('[router] no outlet mounted yet')
        return
    }

    // Parse current hash: '#/about' → '/about', fallback to '/'
    const hash = window.location.hash
    const path = hash.startsWith('#') ? hash.slice(1) || '/' : '/'
    console.log('[router] resolving path:', path)

    const matched = _routes.find(r => _matchPath(r.path, path))

    if (!matched) {
        console.log('[router] no route matched for:', path)
        _outlet.innerHTML = `<p style="color:red">[framework] No route matched for "${path}"</p>`
        return
    }

    console.log('[router] matched route:', matched.path)

    // Unmount previous component to run cleanup hooks
    if (_currentInstance) {
        console.log('[router] unmounting previous instance')
        try { _currentInstance.unmount() } catch {}
    }

    _outlet.innerHTML = ''

    const componentFn = matched.component
    console.log('[router] mounting component for:', matched.path)
    _currentInstance = componentFn()
    _currentInstance.render(_outlet)
}

// Simple path matching — supports exact paths and :param segments
function _matchPath(routePath, actualPath) {
    const routeParts = routePath.split('/').filter(Boolean)
    const actualParts = actualPath.split('/').filter(Boolean)

    if (routeParts.length !== actualParts.length) return false

    return routeParts.every((part, i) =>
        part.startsWith(':') || part === actualParts[i]
    )
}

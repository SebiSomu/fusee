// ─── Hash-based SPA Router ────────────────────────────────────────────────────
// Routes are declared as: { path: '/about', component: AboutComponent }
// Navigation via <a href="#/about"> or router.navigate('/about')

let _routes = []
let _outlet = null
let _currentInstance = null

export function createRouter(routes) {
  _routes = routes

  // Listen for hash changes (back/forward + manual URL edits)
  window.addEventListener('hashchange', () => _resolve())

  // Initial render on page load
  window.addEventListener('DOMContentLoaded', () => _resolve())

  return { navigate }
}

export function navigate(path) {
  window.location.hash = path
}

// ── Mount outlet ──────────────────────────────────────────────────────────────
// Call this with the DOM element that acts as <router-outlet>
export function mountOutlet(el) {
  _outlet = el
  _resolve()
}

// ── Internal resolution ───────────────────────────────────────────────────────
function _resolve() {
  if (!_outlet) return

  // Parse current hash: '#/about' → '/about', fallback to '/'
  const hash = window.location.hash
  const path = hash.startsWith('#') ? hash.slice(1) || '/' : '/'

  const matched = _routes.find(r => _matchPath(r.path, path))

  if (!matched) {
    _outlet.innerHTML = `<p style="color:red">[framework] No route matched for "${path}"</p>`
    return
  }

  // Unmount previous component to run cleanup hooks
  if (_currentInstance) {
    try { _currentInstance.unmount() } catch {}
  }

  _outlet.innerHTML = ''

  const componentFn = matched.component
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

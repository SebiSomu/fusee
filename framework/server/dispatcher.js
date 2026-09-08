export function compilePath(path) {
    const paramNames = []
    let src = path
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, () => { paramNames.push('*'); return '(.*)' })
        .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
            paramNames.push(name)
            return '([^/]+)'
        })

    const re = new RegExp(`^${src}\\/?$`)
    return { re, paramNames }
}

function _matchPath(compiled, pathname) {
    const m = compiled.re.exec(pathname)
    if (!m) return null
    const params = {}
    for (let i = 0; i < compiled.paramNames.length; i++) {
        params[compiled.paramNames[i]] = m[i + 1]
    }
    return params
}

function _parseQuery(urlString) {
    try {
        const url = new URL(urlString, 'http://x')
        const query = {}
        url.searchParams.forEach((v, k) => { query[k] = v })
        return query
    } catch {
        return {}
    }
}

export function flattenRoutes(routes, prefix) {
    if (prefix === undefined) prefix = ''
    const flat = []
    for (const route of routes) {
        const abs = prefix + (route.path || '')
        const compiled = compilePath(abs || '/')

        flat.push({
            path: abs || '/',
            loader: route.loader,
            action: route.action,
            compiled
        })

        if (Array.isArray(route.children) && route.children.length) {
            flat.push(...flattenRoutes(route.children, abs))
        }
    }
    return flat
}

function _sendJson(res, status, body) {
    if (res.headersSent) return
    const json = JSON.stringify(body)
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(json)
    })
    res.end(json)
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])


export function createDispatcher(routes) {
    const flat = flattenRoutes(Array.isArray(routes) ? routes : [routes])

    return async function dispatcher(req, res) {
        const method = (req.method || 'GET').toUpperCase()
        const rawUrl = req.url || '/'
        const pathname = rawUrl.split('?')[0]
        const query = _parseQuery(rawUrl)

        let matchedRoute = null
        let matchedParams = null

        for (const route of flat) {
            const params = _matchPath(route.compiled, pathname)
            if (params !== null) {
                matchedRoute = route
                matchedParams = params
                break
            }
        }

        if (!matchedRoute) {
            _sendJson(res, 404, { error: 'Not Found', path: pathname })
            return
        }

        const isRead = method === 'GET' || method === 'HEAD'
        const isMutation = MUTATION_METHODS.has(method)
        const handler = isRead ? matchedRoute.loader : isMutation ? matchedRoute.action : null

        if (!handler) {
            const allowed = [
                matchedRoute.loader ? 'GET, HEAD' : '',
                matchedRoute.action ? 'POST, PUT, PATCH, DELETE' : ''
            ].filter(Boolean).join(', ')

            res.writeHead(405, { Allow: allowed || 'GET' })
            res.end('Method Not Allowed')
            return
        }

        const ctx = { req, res, params: matchedParams, query, method }

        let result
        try {
            result = await handler(ctx)
        } catch (err) {
            console.error('[fusee] dispatcher: handler threw', err)
            if (!res.headersSent) {
                _sendJson(res, (err && err.status) ? err.status : 500, {
                    error: (err && err.expose) ? err.message : 'Internal Server Error',
                    code: err && err.code
                })
            }
            return
        }

        if (result !== undefined && !res.headersSent) {
            _sendJson(res, 200, result)
        }
    }
}

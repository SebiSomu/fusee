import { resolveStaticFile, serveStaticFile } from './static-assets.js'
import { matchRoute } from './route-matcher.js'
import { RouteRedirect, RouteHttpError } from './load-helpers.js'
import { handleActionRequest } from './actions.server.js'
 
const DEFAULT_ACTIONS_BASE = '/__fusee/actions'

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

export function createDispatcher({ distDir, routes = [], renderPage, actionsBasePath = DEFAULT_ACTIONS_BASE }) {
    if (typeof renderPage !== 'function') {
        throw new Error('[fusee] createDispatcher requires a renderPage(ctx) function')
    }
 
    return async function dispatch(req, res) {
        const url = new URL(req.url, 'http://localhost')
        const pathname = url.pathname
 
        //Static asset bypass
        if (distDir && (req.method === 'GET' || req.method === 'HEAD')) {
            const filePath = await resolveStaticFile(distDir, pathname)
            if (filePath) {
                await serveStaticFile(filePath, req, res)
                return
            }
        }
 
        //Server Actions interceptor
        if (req.method === 'POST' && pathname.startsWith(actionsBasePath)) {
            const name = pathname.slice(actionsBasePath.length).replace(/^\//, '')
            req.params = { ...(req.params || {}), name }
            await handleActionRequest(req, res)
            return
        }
 
        //Route matcher + data loader
        const matched = matchRoute(routes, pathname)
        if (!matched) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
            return
        }
 
        const { route, params } = matched
        const query = Object.fromEntries(url.searchParams)
 
        let data
        try {
            if (typeof route.module?.load === 'function') {
                data = await route.module.load({ params, query, request: req })
            }
        } catch (err) {
            if (err instanceof RouteRedirect) {
                res.writeHead(err.status, { Location: err.location })
                res.end()
                return
            }
            if (err instanceof RouteHttpError) {
                res.writeHead(err.status, { 'Content-Type': 'text/plain' })
                res.end(err.message || 'Error')
                return
            }
            console.error(`[fusée] load() threw for route "${route.pattern}":`, err)
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Internal Server Error')
            return
        }
 
        await renderPage({ route, params, query, data, req, res })
    }
}
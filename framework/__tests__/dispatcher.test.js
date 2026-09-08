import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { compilePath, flattenRoutes, createDispatcher } from '../server/dispatcher.js'
import { createRequestPipeline } from '../server/pipeline.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function makeMockReqRes(method, url) {
    const req = new EventEmitter()
    req.method = method || 'GET'
    req.url = url || '/'
    const res = {
        headersSent: false,
        statusCode: null,
        headers: {},
        body: '',
        writeHead(status, headers) {
            this.statusCode = status
            this.headers = { ...this.headers, ...headers }
            this.headersSent = true
        },
        write(chunk) { this.body += chunk },
        end(chunk) { if (chunk) this.body += chunk; this.ended = true },
        destroy(err) { this.destroyed = true; this.destroyErr = err }
    }
    return { req, res }
}

function parsedBody(res) {
    try { return JSON.parse(res.body) } catch { return res.body }
}

// ═══════════════════════════════════════════════════════════════════════════════
// compilePath
// ═══════════════════════════════════════════════════════════════════════════════

describe('compilePath', () => {
    it('matches a static path exactly', () => {
        const c = compilePath('/about')
        expect(c.re.test('/about')).toBe(true)
        expect(c.re.test('/about/')).toBe(true)  // trailing slash optional
        expect(c.re.test('/about/x')).toBe(false)
        expect(c.paramNames).toEqual([])
    })

    it('matches the root path', () => {
        const c = compilePath('/')
        expect(c.re.test('/')).toBe(true)
        expect(c.paramNames).toEqual([])
    })

    it('captures :param segments', () => {
        const c = compilePath('/users/:id')
        const m = c.re.exec('/users/42')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('42')
        expect(c.paramNames).toEqual(['id'])
    })

    it('captures multiple :params', () => {
        const c = compilePath('/posts/:category/:slug')
        const m = c.re.exec('/posts/tech/hello-world')
        expect(m[1]).toBe('tech')
        expect(m[2]).toBe('hello-world')
        expect(c.paramNames).toEqual(['category', 'slug'])
    })

    it('captures wildcard * (greedy, includes slashes)', () => {
        const c = compilePath('/files/*')
        const m = c.re.exec('/files/a/b/c.txt')
        expect(m[1]).toBe('a/b/c.txt')
        expect(c.paramNames).toEqual(['*'])
    })

    it('does not match a different static path', () => {
        const c = compilePath('/about')
        expect(c.re.test('/contact')).toBe(false)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// flattenRoutes
// ═══════════════════════════════════════════════════════════════════════════════

describe('flattenRoutes', () => {
    it('flattens a single-level list unchanged', () => {
        const routes = [
            { path: '/', loader: () => {} },
            { path: '/about', loader: () => {} }
        ]
        const flat = flattenRoutes(routes)
        expect(flat.map(r => r.path)).toEqual(['/', '/about'])
    })

    it('flattens nested children with correct absolute paths', () => {
        const routes = [{
            path: '/users',
            loader: () => {},
            children: [
                { path: '', loader: () => {} },   // /users index
                { path: '/:id', loader: () => {} }
            ]
        }]
        const flat = flattenRoutes(routes)
        expect(flat.map(r => r.path)).toEqual(['/users', '/users', '/users/:id'])
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// createDispatcher
// ═══════════════════════════════════════════════════════════════════════════════

describe('createDispatcher — routing & method dispatch', () => {

    it('calls the loader on GET and passes parsed params + query', async () => {
        let received
        const dispatch = createDispatcher([
            {
                path: '/users/:id',
                loader: (ctx) => { received = ctx; return { ok: true } }
            }
        ])

        const { req, res } = makeMockReqRes('GET', '/users/99?tab=profile')
        await dispatch(req, res)

        expect(received.params).toEqual({ id: '99' })
        expect(received.query).toEqual({ tab: 'profile' })
        expect(res.statusCode).toBe(200)
        expect(parsedBody(res)).toEqual({ ok: true })
    })

    it('calls the action on POST', async () => {
        let calledWith
        const dispatch = createDispatcher([{
            path: '/api/items',
            action: (ctx) => { calledWith = ctx.method; return { created: true } }
        }])

        const { req, res } = makeMockReqRes('POST', '/api/items')
        await dispatch(req, res)

        expect(calledWith).toBe('POST')
        expect(res.statusCode).toBe(200)
        expect(parsedBody(res)).toEqual({ created: true })
    })

    it('calls the action on PUT, PATCH, and DELETE', async () => {
        for (const method of ['PUT', 'PATCH', 'DELETE']) {
            let called = false
            const dispatch = createDispatcher([{
                path: '/api/item',
                action: () => { called = true }
            }])
            const { req, res } = makeMockReqRes(method, '/api/item')
            await dispatch(req, res)
            expect(called, `${method} should invoke action`).toBe(true)
        }
    })

    it('returns 404 when no route matches', async () => {
        const dispatch = createDispatcher([{ path: '/home', loader: () => {} }])
        const { req, res } = makeMockReqRes('GET', '/nope')
        await dispatch(req, res)
        expect(res.statusCode).toBe(404)
        expect(parsedBody(res).error).toBe('Not Found')
    })

    it('returns 405 when route matches but method has no handler', async () => {
        const dispatch = createDispatcher([{
            path: '/readonly',
            loader: () => ({ data: 1 })
            // no action defined
        }])
        const { req, res } = makeMockReqRes('POST', '/readonly')
        await dispatch(req, res)
        expect(res.statusCode).toBe(405)
        expect(res.headers['Allow']).toContain('GET')
    })

    it('auto-serialises a returned value as JSON (loader)', async () => {
        const dispatch = createDispatcher([{
            path: '/',
            loader: () => ({ hello: 'world' })
        }])
        const { req, res } = makeMockReqRes('GET', '/')
        await dispatch(req, res)
        expect(res.statusCode).toBe(200)
        expect(res.headers['Content-Type']).toContain('application/json')
        expect(parsedBody(res)).toEqual({ hello: 'world' })
    })

    it('does NOT double-write when handler writes res directly', async () => {
        const dispatch = createDispatcher([{
            path: '/stream',
            loader: ({ res }) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' })
                res.end('raw text')
                // returns undefined → no auto-JSON
            }
        }])
        const { req, res } = makeMockReqRes('GET', '/stream')
        await dispatch(req, res)
        expect(res.body).toBe('raw text')
        // writeHead should only have been called once
        expect(res.statusCode).toBe(200)
    })

    it('returns 500 when the handler throws', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const dispatch = createDispatcher([{
            path: '/boom',
            loader: () => { throw new Error('oops') }
        }])
        const { req, res } = makeMockReqRes('GET', '/boom')
        await dispatch(req, res)
        expect(res.statusCode).toBe(500)
        errSpy.mockRestore()
    })

    it('exposes err.message when err.expose is true', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const dispatch = createDispatcher([{
            path: '/forbidden',
            loader: () => {
                const err = new Error('you shall not pass')
                err.status = 403
                err.expose = true
                throw err
            }
        }])
        const { req, res } = makeMockReqRes('GET', '/forbidden')
        await dispatch(req, res)
        expect(res.statusCode).toBe(403)
        expect(parsedBody(res).error).toBe('you shall not pass')
        errSpy.mockRestore()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// createDispatcher + createRequestPipeline (integration)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createDispatcher inside createRequestPipeline — Layer 1+2 integration', () => {
    it('each concurrent request gets its own context and correct route params', async () => {
        const results = []

        const dispatch = createDispatcher([{
            path: '/users/:id',
            loader: async ({ req, params }) => {
                await delay(req.delayMs)
                results.push({ id: params.id })
                return { id: params.id }
            }
        }])

        const listener = createRequestPipeline(dispatch)

        const { req: r1, res: res1 } = makeMockReqRes('GET', '/users/alice')
        r1.delayMs = 20
        const { req: r2, res: res2 } = makeMockReqRes('GET', '/users/bob')
        r2.delayMs = 5

        listener(r1, res1)
        listener(r2, res2)
        await delay(40)

        // bob resolves first (5ms) then alice (20ms)
        expect(results[0].id).toBe('bob')
        expect(results[1].id).toBe('alice')

        expect(parsedBody(res1)).toEqual({ id: 'alice' })
        expect(parsedBody(res2)).toEqual({ id: 'bob' })
    })
})

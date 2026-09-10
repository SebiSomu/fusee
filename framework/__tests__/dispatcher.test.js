import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Writable, Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createDispatcher } from '../server/dispatcher.js'
import { redirect, httpError } from '../server/load-helpers.js'
import { defineAction } from '../server/actions.server.js'

class FakeResponse extends Writable {
    constructor() {
        super()
        this.chunks = []
        this.statusCode = null
        this.headers = null
        this.ended = false
    }
    writeHead(status, headers) { this.statusCode = status; this.headers = headers }
    _write(chunk, enc, cb) { this.chunks.push(Buffer.from(chunk)); cb() }
    end(chunk) { if (chunk) this.chunks.push(Buffer.from(chunk)); this.ended = true; super.end() }
    get body() { return Buffer.concat(this.chunks).toString('utf8') }
    header(name) {
        const key = Object.keys(this.headers || {}).find(k => k.toLowerCase() === name.toLowerCase())
        return key ? this.headers[key] : undefined
    }
}

function fakeReq(method = 'GET', url = '/', body) {
  const payload = body !== undefined ? JSON.stringify(body) : null
  
  const req = new Readable({
    read() {
      if (payload !== null) {
        this.push(payload)
      }
      this.push(null) // Signals end of stream
    }
  })

  req.method = method
  req.url = url
  req.headers = {
    'accept-encoding': '',
    'content-type': 'application/json'
  }

  return req
}

let distDir

beforeAll(async () => {
    distDir = await mkdtemp(path.join(tmpdir(), 'fusee-dispatcher-'))
    await writeFile(path.join(distDir, 'app.js'), 'console.log("static asset")')
})

afterAll(async () => {
    await rm(distDir, { recursive: true, force: true })
})

describe('createDispatcher — resolution order', () => {
    it('serves a static asset before even considering routes', async () => {
        const renderPage = vi.fn()
        const dispatch = createDispatcher({
            distDir,
            routes: [{ pattern: '/app.js', module: {} }], // would ALSO match, if static bypass didn't win
            renderPage
        })

        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/app.js'), res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toBe('console.log("static asset")')
        expect(renderPage).not.toHaveBeenCalled()
    })

    it('routes a POST to the actions base path to the action registry, bypassing route matching', async () => {
        defineAction(async function dispatcherTestEcho(x) { return { echoed: x } }, { name: 'dispatcherTestEcho' })

        const renderPage = vi.fn()
        const dispatch = createDispatcher({
            distDir,
            routes: [],
            renderPage,
            actionsBasePath: '/__fusee/actions'
        })

        const res = new FakeResponse()
        await dispatch(fakeReq('POST', '/__fusee/actions/dispatcherTestEcho', { args: ['hello'] }), res)

        expect(res.statusCode).toBe(200)
        expect(JSON.parse(res.body)).toEqual({ data: { echoed: 'hello' } })
        expect(renderPage).not.toHaveBeenCalled()
    })

    it('a GET to a path matching a route pattern is NOT intercepted as an action even if it looks similar', async () => {
        const renderPage = vi.fn(async ({ res }) => { res.writeHead(200, {}); res.end('page') })
        const dispatch = createDispatcher({
            distDir,
            routes: [{ pattern: '/__fusee/actions/foo', module: {} }],
            renderPage
        })

        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/__fusee/actions/foo'), res)
        expect(renderPage).toHaveBeenCalled() // GET bypasses the actions interceptor (POST-only)
    })
})

describe('createDispatcher — route matching + load()', () => {
    it('matches a route, runs load(), and passes its data + params + query into renderPage', async () => {
        const load = vi.fn(async ({ params, query }) => ({ greeting: `hi ${params.name}`, q: query.foo }))
        const renderPage = vi.fn(async (ctx) => {
            ctx.res.writeHead(200, {})
            ctx.res.end(JSON.stringify({ params: ctx.params, query: ctx.query, data: ctx.data }))
        })

        const dispatch = createDispatcher({
            routes: [{ pattern: '/hello/[name]', module: { load } }],
            renderPage
        })

        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/hello/world?foo=bar'), res)

        expect(load).toHaveBeenCalledWith({ params: { name: 'world' }, query: { foo: 'bar' }, request: expect.anything() })
        const body = JSON.parse(res.body)
        expect(body.params).toEqual({ name: 'world' })
        expect(body.query).toEqual({ foo: 'bar' })
        expect(body.data).toEqual({ greeting: 'hi world', q: 'bar' })
    })

    it('renders a route with no load() export at all (data is undefined)', async () => {
        const renderPage = vi.fn(async (ctx) => {
            ctx.res.writeHead(200, {})
            ctx.res.end(String(ctx.data))
        })
        const dispatch = createDispatcher({ routes: [{ pattern: '/static-page', module: {} }], renderPage })

        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/static-page'), res)
        expect(res.body).toBe('undefined')
    })

    it('returns 404 for a path matching no route', async () => {
        const dispatch = createDispatcher({ routes: [{ pattern: '/only-this', module: {} }], renderPage: vi.fn() })
        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/nope'), res)
        expect(res.statusCode).toBe(404)
    })

    it('load() calling redirect() produces a real HTTP redirect response, never reaching renderPage', async () => {
        const renderPage = vi.fn()
        const load = async () => redirect(302, '/login')
        const dispatch = createDispatcher({ routes: [{ pattern: '/private', module: { load } }], renderPage })

        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/private'), res)

        expect(res.statusCode).toBe(302)
        expect(res.header('Location')).toBe('/login')
        expect(renderPage).not.toHaveBeenCalled()
    })

    it('load() calling httpError() produces that exact status, never reaching renderPage', async () => {
        const renderPage = vi.fn()
        const load = async () => httpError(403, 'Forbidden: not your resource')
        const dispatch = createDispatcher({ routes: [{ pattern: '/secret', module: { load } }], renderPage })

        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/secret'), res)

        expect(res.statusCode).toBe(403)
        expect(res.body).toBe('Forbidden: not your resource')
        expect(renderPage).not.toHaveBeenCalled()
    })

    it('load() throwing a plain Error becomes a 500 and is logged, never reaching renderPage', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const renderPage = vi.fn()
        const load = async () => { throw new Error('db connection failed') }
        const dispatch = createDispatcher({ routes: [{ pattern: '/broken', module: { load } }], renderPage })

        const res = new FakeResponse()
        await dispatch(fakeReq('GET', '/broken'), res)

        expect(res.statusCode).toBe(500)
        expect(renderPage).not.toHaveBeenCalled()
        expect(errSpy).toHaveBeenCalled()
        errSpy.mockRestore()
    })

    it('throws at construction time if renderPage is missing', () => {
        expect(() => createDispatcher({ routes: [] })).toThrow(/requires a renderPage/)
    })
})
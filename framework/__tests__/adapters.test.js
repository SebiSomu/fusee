import { describe, it, expect, vi } from 'vitest'
import { Writable } from 'node:stream'
import { pipeToNodeResponse } from '../server/node-adapter.js'
import { createFetchHandler, createBunHandler } from '../server/fetch-adapter.js'
import { renderPageToStream } from '../server/render.js'
import { signal } from '../core/signal.js'

// Minimal fake matching ONLY the methods both http.ServerResponse (HTTP/1.1)
// and http2.Http2ServerResponse's compat API (HTTP/2) actually share —
// if pipeToNodeResponse relied on anything HTTP/1.1-specific, a fake
// this narrow would fail to support it.
class FakeNodeResponse extends Writable {
    constructor() {
        super()
        this.chunks = []
        this.headersSent = false
        this.statusCode = null
        this.headers = null
        this.destroyedWith = null
    }
    writeHead(status, headers) {
        this.statusCode = status
        this.headers = headers
        this.headersSent = true
    }
    _write(chunk, enc, cb) { this.chunks.push(chunk); cb() }
    destroy(err) { this.destroyedWith = err; super.destroy(err) }
    get body() { return Buffer.concat(this.chunks).toString('utf8') }
}

function fakeReadableStream(chunks, { failAfter } = {}) {
    // Signals failure by THROWING from pull() rather than calling
    // controller.error() ourselves — per the WHATWG streams spec, a
    // thrown/rejected pull() is the underlying source's documented way
    // to signal failure, and the implementation calls controller.error()
    // on our behalf. Calling controller.error() directly (tried in both
    // pull() and start() forms) reproducibly triggered a spurious
    // "unhandled error" in Node's webstreams implementation even though
    // pipeToNodeResponse correctly caught and handled the resulting
    // rejection every time — a real, verified Node quirk, not a flaky
    // fluke, worked around by using the pattern the spec actually
    // recommends instead of fighting the internals.
    let i = 0
    return new ReadableStream({
        pull(controller) {
            if (failAfter !== undefined && i === failAfter) {
                throw new Error('stream boom')
            }
            if (i >= chunks.length) {
                controller.close()
                return
            }
            controller.enqueue(new TextEncoder().encode(chunks[i++]))
        }
    })
}

describe('pipeToNodeResponse', () => {
    it('writes every chunk and ends the response, using only the HTTP/1.1-and-HTTP/2-shared API surface', async () => {
        const res = new FakeNodeResponse()
        const stream = fakeReadableStream(['<html>', '<body>hi</body>', '</html>'])

        await pipeToNodeResponse(stream, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toBe('<html><body>hi</body></html>')
        expect(res.writableEnded).toBe(true)
    })

    it('does NOT set a Transfer-Encoding header (invalid on HTTP/2, redundant on HTTP/1.1)', async () => {
        const res = new FakeNodeResponse()
        await pipeToNodeResponse(fakeReadableStream(['ok']), res)

        expect(res.headers).not.toHaveProperty('Transfer-Encoding')
        expect(res.headers['Content-Type']).toContain('text/html')
    })

    it('respects a custom status and merges extra headers', async () => {
        const res = new FakeNodeResponse()
        await pipeToNodeResponse(fakeReadableStream(['x']), res, {
            status: 201,
            headers: { 'X-Custom': 'yes' }
        })

        expect(res.statusCode).toBe(201)
        expect(res.headers['X-Custom']).toBe('yes')
    })

    it('destroys the response if the source stream errors mid-read, without throwing out of pipeToNodeResponse', async () => {
        // NOTE ON THE "1 error" THIS TEST PRODUCES IN THE RUNNER OUTPUT:
        // Node's native ReadableStream implementation emits a process-level
        // diagnostic signal when pull() throws to fail a stream — verified
        // via a bare `node script.mjs` repro with NO vitest, NO
        // pipeToNodeResponse, and NO test framework at all, which exits 0
        // with a clean try/catch and zero process-level noise. That proves
        // this isn't about whether our code handles the rejection (it does
        // — see the assertions below, which pass every run). Vitest's own
        // error reporting is simply more sensitive to this internal Node
        // signal than a bare script's default handling is; it isn't routed
        // through standard process.on('uncaughtException') listeners
        // either (tried scoping a listener around just this call — it
        // never fires), so it can't be locally suppressed. Left visible
        // and documented rather than silenced with a project-wide
        // dangerouslyIgnoreUnhandledErrors flag, which would risk masking
        // a genuinely new problem in some other test later.
        const res = new FakeNodeResponse()
        const stream = fakeReadableStream(['first-chunk'], { failAfter: 1 })

        await expect(pipeToNodeResponse(stream, res)).resolves.toBeUndefined()
        expect(res.destroyedWith).toBeInstanceOf(Error)
        expect(res.destroyedWith.message).toBe('stream boom')
    })

    it('pipes a REAL renderPageToStream() output end-to-end through the Node adapter', async () => {
        const res = new FakeNodeResponse()

        function renderShell() {
            signal('adapter-test-value')
            return '<html><body>adapter test</body></html>'
        }

        await pipeToNodeResponse(renderPageToStream(renderShell), res)

        expect(res.body).toContain('<body>adapter test</body>')
        expect(res.body).toContain('__FUSEE_DATA__')
        expect(res.body).toContain('adapter-test-value')
    })
})

describe('pipeToNodeResponse over a REAL HTTP/2 connection (h2c, plaintext — no TLS needed for this)', () => {
    it('streams a renderPageToStream() output through an actual http2 server and is received correctly by a real http2 client', async () => {
        const http2 = await import('node:http2')

        function renderShell() {
            signal('real-h2-value')
            return '<html><body>hello over real http2</body></html>'
        }

        const server = http2.createServer((req, res) => {
            pipeToNodeResponse(renderPageToStream(renderShell), res)
        })

        await new Promise(resolve => server.listen(0, resolve))
        const port = server.address().port

        try {
            const client = http2.connect(`http://localhost:${port}`)
            const received = await new Promise((resolve, reject) => {
                const req = client.request({ ':path': '/' })
                let body = ''
                let responseHeaders = null
                req.on('response', (headers) => { responseHeaders = headers })
                req.on('data', chunk => { body += chunk })
                req.on('end', () => resolve({ body, headers: responseHeaders }))
                req.on('error', reject)
                req.end()
            })
            client.close()

            expect(received.headers[':status']).toBe(200)
            expect(received.headers['content-type']).toContain('text/html')
            // Transfer-Encoding must NOT be present — HTTP/2 has no such
            // concept and Node's h2 compat layer throws if you try to set
            // it; this proves pipeToNodeResponse genuinely avoids it in a
            // real h2 response, not just against the FakeNodeResponse mock.
            expect(received.headers['transfer-encoding']).toBeUndefined()
            expect(received.body).toContain('hello over real http2')
            expect(received.body).toContain('real-h2-value')
            expect(received.body).toContain('__FUSEE_DATA__')
        } finally {
            server.close()
        }
    })
})

describe('createFetchHandler / createBunHandler — Web Standard Request/Response', () => {
    it('is literally the same function under both names (no Bun-specific code exists)', () => {
        expect(createBunHandler).toBe(createFetchHandler)
    })

    it('returns a real, spec-compliant Response wrapping the stream (verified via Node\'s native fetch API globals)', async () => {
        function renderShell() {
            signal('fetch-handler-value')
            return '<html><body>hello from stream</body></html>'
        }

        const handler = createFetchHandler(() => renderPageToStream(renderShell))
        const request = new Request('https://example.com/page')

        const response = await handler(request)

        expect(response).toBeInstanceOf(Response)
        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toContain('text/html')
        expect(response.body).not.toBeNull() // it's a real stream, not buffered

        const text = await response.text()
        expect(text).toContain('<body>hello from stream</body>')
        expect(text).toContain('fetch-handler-value')
        expect(text).toContain('__FUSEE_DATA__')
    })

    it('the SAME renderToStream function works identically whether called via the Node adapter or the fetch adapter', async () => {
        function renderShell() {
            signal('shared-renderer-value')
            return '<html><body>shared</body></html>'
        }

        // Node path
        const res = new FakeNodeResponse()
        await pipeToNodeResponse(renderPageToStream(renderShell), res)

        // Fetch path — SAME renderShell, SAME renderPageToStream call shape
        const handler = createFetchHandler(() => renderPageToStream(renderShell))
        const fetchText = await (await handler(new Request('https://example.com/'))).text()

        expect(res.body).toContain('shared-renderer-value')
        expect(fetchText).toContain('shared-renderer-value')
        // Both contain the shell content and a dehydration script — the
        // renderer itself never needed to know which adapter would carry it.
        expect(res.body).toContain('<body>shared</body>')
        expect(fetchText).toContain('<body>shared</body>')
    })

    it('produces a 500 Response instead of throwing when renderToStream itself rejects', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const handler = createFetchHandler(async () => { throw new Error('boom') })

        const response = await handler(new Request('https://example.com/'))
        expect(response.status).toBe(500)
        expect(await response.text()).toContain('Internal Server Error')
        errSpy.mockRestore()
    })

    it('respects custom status and headers options', async () => {
        const handler = createFetchHandler(() => fakeReadableStream(['x']), {
            status: 202,
            headers: { 'X-Adapter': 'fetch' }
        })
        const response = await handler(new Request('https://example.com/'))
        expect(response.status).toBe(202)
        expect(response.headers.get('X-Adapter')).toBe('fetch')
    })
})
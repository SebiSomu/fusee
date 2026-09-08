import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createRequestPipeline } from '../server/pipeline.js'
import { withRequestContext, createRequestContext } from '../server/index.js'
import { withSignalScope, extractSignalRegistrySnapshot, clearSignalRegistry } from '../core/signal-scope.js'
import { signal } from '../core/signal.js'
import { isSSRContext, getInFlightStore, getSignalRegistry } from '../core/async-context.js'

function delay(ms, v) { return new Promise(r => setTimeout(() => r(v), ms)) }

describe('withSignalScope — concurrency hardening (Layer 1)', () => {
    it('records correctly for an async setup with signal() calls both before AND after an await', async () => {
        clearSignalRegistry()

        await withSignalScope('async-widget', async () => {
            signal('before-await')
            await delay(10)
            signal('after-await')
        })

        const snapshot = extractSignalRegistrySnapshot()
        expect(snapshot['async-widget']).toEqual(['before-await', 'after-await'])
    })

    it('does not corrupt slot indices when two sibling async setups race concurrently (Promise.all)', async () => {
        clearSignalRegistry()

        async function setupA() {
            return withSignalScope('widget-A', async () => {
                signal('A-1')
                await delay(15) // resolves SECOND
                signal('A-2')
            })
        }
        async function setupB() {
            return withSignalScope('widget-B', async () => {
                signal('B-1')
                await delay(3) // resolves FIRST, while A is still mid-flight
                signal('B-2')
            })
        }

        await Promise.all([setupA(), setupB()])

        const snapshot = extractSignalRegistrySnapshot()
        // This is exactly the case a manual stack corrupts: B pushes,
        // A pushes, B resumes and pops while A is still suspended — with
        // a plain array, "current frame" after B's resume would be
        // whichever frame is on TOP, which may not be B's own frame at
        // all. The ALS-backed version keeps each chain's frame correctly
        // attached regardless of resolution order.
        expect(snapshot['widget-A']).toEqual(['A-1', 'A-2'])
        expect(snapshot['widget-B']).toEqual(['B-1', 'B-2'])
    })

    it('nested scopes remain correctly isolated even when the inner scope is async', async () => {
        clearSignalRegistry()

        await withSignalScope('outer', async () => {
            signal('outer-1')
            await withSignalScope('inner', async () => {
                signal('inner-1')
                await delay(5)
                signal('inner-2')
            })
            signal('outer-2')
        })

        const snapshot = extractSignalRegistrySnapshot()
        expect(snapshot.outer).toEqual(['outer-1', 'outer-2'])
        expect(snapshot.inner).toEqual(['inner-1', 'inner-2'])
    })
})

// Minimal fake http.IncomingMessage/ServerResponse so we can drive
// createRequestPipeline() without spinning up a real TCP server.
function makeMockReqRes() {
    const req = new EventEmitter()
    const res = {
        headersSent: false,
        statusCode: null,
        headers: null,
        body: '',
        writeHead(status, headers) {
            this.statusCode = status
            this.headers = headers
            this.headersSent = true
        },
        write(chunk) { this.body += chunk },
        end(chunk) { if (chunk) this.body += chunk; this.ended = true },
        destroy(err) { this.destroyed = true; this.destroyErr = err }
    }
    return { req, res }
}

describe('createRequestPipeline — Layer 1 entry point', () => {
    it('downstream functions read the active context with zero prop-drilling', async () => {
        expect(isSSRContext()).toBe(false)

        let seenInsideHandler
        const listener = createRequestPipeline((req, res) => {
            seenInsideHandler = isSSRContext()
            res.end('ok')
        })

        const { req, res } = makeMockReqRes()
        listener(req, res)
        await delay(0)

        expect(seenInsideHandler).toBe(true)
        expect(isSSRContext()).toBe(false) // back to false once the request's scope has exited
    })

    it('gives each request its own isolated stores — inFlightMaps, signalRegistry — never shared', async () => {
        const captured = []

        const listener = createRequestPipeline(async (req, res) => {
            const store = getInFlightStore()
            const userId = req.userId
            await delay(userId === 'A' ? 15 : 5)
            withSignalScope('page', () => signal(`data-for-${userId}`))
            captured.push({ userId, store, signals: extractSignalRegistrySnapshot() })
            res.end('ok')
        })

        const { req: reqA, res: resA } = makeMockReqRes()
        reqA.userId = 'A'
        const { req: reqB, res: resB } = makeMockReqRes()
        reqB.userId = 'B'

        listener(reqA, resA)
        listener(reqB, resB)
        await delay(30)

        const a = captured.find(c => c.userId === 'A')
        const b = captured.find(c => c.userId === 'B')
        expect(a.store).not.toBe(b.store)
        expect(a.signals.page).toEqual(['data-for-A'])
        expect(b.signals.page).toEqual(['data-for-B'])
        expect(resA.body).toBe('ok')
        expect(resB.body).toBe('ok')
    })

    it('contains a handler error to a 500 response instead of crashing/hanging', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const listener = createRequestPipeline(() => {
            throw new Error('handler blew up')
        })

        const { req, res } = makeMockReqRes()
        listener(req, res)
        await delay(0)

        expect(res.statusCode).toBe(500)
        expect(res.ended).toBe(true)
        errSpy.mockRestore()
    })

    it('one failing request does not affect a concurrently-running healthy request', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const listener = createRequestPipeline(async (req, res) => {
            if (req.shouldFail) {
                await delay(5)
                throw new Error('boom')
            }
            await delay(10)
            res.end('healthy response')
        })

        const { req: badReq, res: badRes } = makeMockReqRes()
        badReq.shouldFail = true
        const { req: goodReq, res: goodRes } = makeMockReqRes()

        listener(badReq, badRes)
        listener(goodReq, goodRes)
        await delay(20)

        expect(badRes.statusCode).toBe(500)
        expect(goodRes.body).toBe('healthy response')
        expect(goodRes.statusCode).not.toBe(500)
        errSpy.mockRestore()
    })
})
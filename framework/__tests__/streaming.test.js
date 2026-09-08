import { describe, it, expect, vi } from 'vitest'
import {
    createSSRStreamResponse,
    renderSuspenseBoundary,
    streamToString,
    pipeToNodeResponse,
    createRequestContext,
    withRequestContext,
} from '../server/index.js'
import { isSSRContext, getStreamBoundaryStore } from '../core/async-context.js'

function delay(ms, value) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms))
}

async function collectChunks(stream) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const chunks = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
    }
    return chunks
}

describe('Step 3: Fast HTML Streaming & Suspense Boundaries', () => {
    it('streams static synchronous shell with no boundaries', async () => {
        const stream = createSSRStreamResponse(() => '<html><body><h1>Hello World</h1></body></html>')
        const chunks = await collectChunks(stream)

        expect(chunks).toEqual(['<html><body><h1>Hello World</h1></body></html>'])
    })

    it('streams async shell promise', async () => {
        const stream = createSSRStreamResponse(async () => {
            await delay(5)
            return '<div id="app">Async Shell Content</div>'
        })
        const result = await streamToString(stream)
        expect(result).toBe('<div id="app">Async Shell Content</div>')
    })

    it('flushes fallback placeholder first, then streams resolved boundary template chunk', async () => {
        const stream = createSSRStreamResponse(() => {
            const boundaryHtml = renderSuspenseBoundary({
                id: 'my-boundary',
                fetcher: async () => delay(10, { title: 'Async Loaded Title' }),
                fallback: () => '<span>Loading user data...</span>',
                render: (data) => `<h2>${data.title}</h2>`
            })
            return `<html><body><main>${boundaryHtml}</main></body></html>`
        })

        const chunks = await collectChunks(stream)

        expect(chunks).toHaveLength(2)
        // Chunk 1: Initial shell with fallback
        expect(chunks[0]).toBe('<html><body><main><div id="my-boundary" data-f-boundary><span>Loading user data...</span></div></main></body></html>')
        // Chunk 2: Template replacement chunk + swap script
        expect(chunks[1]).toContain('<template id="tpl-my-boundary"><h2>Async Loaded Title</h2></template>')
        expect(chunks[1]).toContain('document.getElementById("tpl-my-boundary")')
        expect(chunks[1]).toContain('d.replaceWith(t.content)')
    })

    it('streams multiple boundaries out-of-order as they resolve', async () => {
        const stream = createSSRStreamResponse(() => {
            const slowBoundary = renderSuspenseBoundary({
                id: 'slow-item',
                fetcher: () => delay(25, 'SLOW DATA'),
                fallback: () => '<p>Loading slow...</p>',
                render: (data) => `<div>${data}</div>`
            })
            const fastBoundary = renderSuspenseBoundary({
                id: 'fast-item',
                fetcher: () => delay(5, 'FAST DATA'),
                fallback: () => '<p>Loading fast...</p>',
                render: (data) => `<div>${data}</div>`
            })
            return `<div class="container">${slowBoundary}${fastBoundary}</div>`
        })

        const chunks = await collectChunks(stream)

        expect(chunks).toHaveLength(3)
        // 1. Initial shell containing both placeholders
        expect(chunks[0]).toContain('id="slow-item"')
        expect(chunks[0]).toContain('id="fast-item"')
        // 2. Fast boundary chunk arrives first (at ~5ms)
        expect(chunks[1]).toContain('tpl-fast-item')
        expect(chunks[1]).toContain('FAST DATA')
        // 3. Slow boundary chunk arrives second (at ~25ms)
        expect(chunks[2]).toContain('tpl-slow-item')
        expect(chunks[2]).toContain('SLOW DATA')
    })

    it('handles boundary fetcher rejection gracefully via onError fallback', async () => {
        const stream = createSSRStreamResponse(() => {
            const boundaryHtml = renderSuspenseBoundary({
                id: 'error-boundary',
                fetcher: async () => {
                    await delay(5)
                    throw new Error('Database connection failed')
                },
                fallback: () => '<p>Loading...</p>',
                onError: (err) => `<p class="error">Error: ${err.message}</p>`,
                render: (data) => `<p>Data: ${data}</p>`
            })
            return `<section>${boundaryHtml}</section>`
        })

        const chunks = await collectChunks(stream)

        expect(chunks).toHaveLength(2)
        expect(chunks[0]).toContain('Loading...')
        expect(chunks[1]).toContain('<template id="tpl-error-boundary"><p class="error">Error: Database connection failed</p></template>')
    })

    it('streams async iterable (generator) shell chunks followed by boundary chunks', async () => {
        async function* generateShell() {
            yield '<!DOCTYPE html><html><head><title>Streaming App</title></head>'
            await delay(2)
            yield '<body><div id="root">'
            const boundary = renderSuspenseBoundary({
                id: 'user-profile',
                fetcher: () => delay(8, 'Alice'),
                fallback: () => '<span>Loading profile...</span>',
                render: (name) => `<h1>Hello, ${name}</h1>`
            })
            yield boundary
            yield '</div></body></html>'
        }

        const stream = createSSRStreamResponse(generateShell)
        const chunks = await collectChunks(stream)

        expect(chunks.length).toBeGreaterThanOrEqual(4)
        const fullOutput = chunks.join('')
        expect(fullOutput).toContain('<!DOCTYPE html>')
        expect(fullOutput).toContain('id="user-profile"')
        expect(fullOutput).toContain('tpl-user-profile')
        expect(fullOutput).toContain('Hello, Alice')
    })

    it('propagates shell errors to stream controller.error()', async () => {
        const stream = createSSRStreamResponse(() => {
            throw new Error('Fatal shell rendering error')
        })

        await expect(collectChunks(stream)).rejects.toThrow('Fatal shell rendering error')
    })

    it('pipeToNodeResponse writes chunks and sets proper HTTP chunked headers', async () => {
        const mockRes = {
            writeHead: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
            destroy: vi.fn(),
        }

        const stream = createSSRStreamResponse(() => {
            const b = renderSuspenseBoundary({
                id: 'node-stream-item',
                fetcher: () => delay(5, 'node-data'),
                render: (d) => `<span>${d}</span>`
            })
            return `<div>${b}</div>`
        })

        await pipeToNodeResponse(stream, mockRes, {
            status: 200,
            headers: { 'X-Custom-Header': 'Fusee-Stream' }
        })

        expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'X-Custom-Header': 'Fusee-Stream'
        })
        expect(mockRes.write).toHaveBeenCalledTimes(2)
        expect(mockRes.end).toHaveBeenCalledTimes(1)
        expect(mockRes.destroy).not.toHaveBeenCalled()
    })

    it('isolates stream boundaries and IDs between concurrent requests', async () => {
        function runRequest(label, delayTime) {
            const stream = createSSRStreamResponse(() => {
                const b1 = renderSuspenseBoundary({
                    fetcher: () => delay(delayTime, `${label}-val`),
                    render: (d) => `<b>${d}</b>`
                })
                return `<div class="${label}">${b1}</div>`
            })
            return streamToString(stream)
        }

        const [resA, resB] = await Promise.all([
            runRequest('reqA', 15),
            runRequest('reqB', 5),
        ])

        // Auto-generated boundary IDs start at 0 per request context and don't leak between requests
        expect(resA).toContain('id="f-boundary-0"')
        expect(resA).toContain('reqA-val')
        expect(resB).toContain('id="f-boundary-0"')
        expect(resB).toContain('reqB-val')
    })
})

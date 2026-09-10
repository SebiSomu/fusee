import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { resolveStaticFile, serveStaticFile } from '../server/static-assets.js'

class FakeResponse extends Writable {
    constructor() {
        super()
        this.chunks = []
        this.statusCode = null
        this.headers = null
        this.headersSent = false
    }
    writeHead(status, headers) {
        this.statusCode = status
        this.headers = headers
        this.headersSent = true
    }
    _write(chunk, enc, cb) { this.chunks.push(chunk); cb() }
    get body() { return Buffer.concat(this.chunks) }
    _headerValue(name) {
        const key = Object.keys(this.headers || {}).find(k => k.toLowerCase() === name.toLowerCase())
        return key ? this.headers[key] : undefined
    }
}

function fakeReq(acceptEncoding) {
    return { headers: { 'accept-encoding': acceptEncoding ?? '' } }
}

let distDir

beforeAll(async () => {
    distDir = await mkdtemp(path.join(tmpdir(), 'fusee-static-'))
    await writeFile(path.join(distDir, 'index.html'), '<html>hello</html>')
    await writeFile(path.join(distDir, 'app.a1b2c3d4e5f6.js'), 'console.log("hashed")')
    await writeFile(path.join(distDir, 'app.js'), 'console.log("not hashed")')
    await mkdir(path.join(distDir, 'nested'))
    await writeFile(path.join(distDir, 'nested', 'file.css'), 'body{color:red}')

    // Precompressed siblings for the "prefer precompressed" test
    const bigContent = 'x'.repeat(2000)
    await writeFile(path.join(distDir, 'big.txt'), bigContent)
    await writeFile(path.join(distDir, 'big.txt.gz'), zlib.gzipSync('PRECOMPRESSED-GZIP-' + bigContent))
    await writeFile(path.join(distDir, 'big.txt.br'), zlib.brotliCompressSync('PRECOMPRESSED-BROTLI-' + bigContent))
})

afterAll(async () => {
    await rm(distDir, { recursive: true, force: true })
})

describe('resolveStaticFile', () => {
    it('resolves an existing file to its real path', async () => {
        const resolved = await resolveStaticFile(distDir, '/index.html')
        expect(resolved).toBe(path.join(distDir, 'index.html'))
    })

    it('resolves nested paths', async () => {
        const resolved = await resolveStaticFile(distDir, '/nested/file.css')
        expect(resolved).toBe(path.join(distDir, 'nested', 'file.css'))
    })

    it('returns null for a nonexistent file', async () => {
        expect(await resolveStaticFile(distDir, '/does-not-exist.js')).toBeNull()
    })

    it('returns null for a directory (not a regular file)', async () => {
        expect(await resolveStaticFile(distDir, '/nested')).toBeNull()
    })

    it('blocks path traversal attempts', async () => {
        expect(await resolveStaticFile(distDir, '/../../../etc/passwd')).toBeNull()
        expect(await resolveStaticFile(distDir, '/..%2f..%2f..%2fetc%2fpasswd')).toBeNull()
        expect(await resolveStaticFile(distDir, '/nested/../../outside.txt')).toBeNull()
    })

    it('strips query strings before resolving', async () => {
        const resolved = await resolveStaticFile(distDir, '/index.html?v=123')
        expect(resolved).toBe(path.join(distDir, 'index.html'))
    })
})

describe('serveStaticFile', () => {
    it('streams file content with the correct content-type', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'index.html'), fakeReq(), res)
        expect(res.statusCode).toBe(200)
        expect(res._headerValue('Content-Type')).toContain('text/html')
        expect(res.body.toString()).toBe('<html>hello</html>')
    })

    it('sets long-term immutable cache headers for a content-hashed filename', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'app.a1b2c3d4e5f6.js'), fakeReq(), res)
        expect(res._headerValue('Cache-Control')).toBe('public, max-age=31536000, immutable')
    })

    it('sets short must-revalidate cache headers for a non-hashed filename', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'app.js'), fakeReq(), res)
        expect(res._headerValue('Cache-Control')).toBe('public, max-age=0, must-revalidate')
    })

    it('compresses on the fly with gzip when Accept-Encoding allows it and no precompressed sibling exists', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'index.html'), fakeReq('gzip, deflate'), res)
        expect(res._headerValue('Content-Encoding')).toBe('gzip')
        expect(res._headerValue('Vary')).toBe('Accept-Encoding')
        const decompressed = zlib.gunzipSync(res.body).toString()
        expect(decompressed).toBe('<html>hello</html>')
    })

    it('compresses on the fly with brotli when preferred over gzip', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'index.html'), fakeReq('gzip, br'), res)
        expect(res._headerValue('Content-Encoding')).toBe('br')
        const decompressed = zlib.brotliDecompressSync(res.body).toString()
        expect(decompressed).toBe('<html>hello</html>')
    })

    it('serves the request uncompressed when Accept-Encoding is absent', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'index.html'), fakeReq(), res)
        expect(res._headerValue('Content-Encoding')).toBeUndefined()
        expect(res.body.toString()).toBe('<html>hello</html>')
    })

    it('prefers an existing precompressed .gz sibling over compressing on the fly', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'big.txt'), fakeReq('gzip'), res)
        const decompressed = zlib.gunzipSync(res.body).toString()
        // The precompressed sibling has different (marker-prefixed) content
        // than the real file — proves the sibling was served, not a fresh
        // on-the-fly compression of big.txt itself.
        expect(decompressed.startsWith('PRECOMPRESSED-GZIP-')).toBe(true)
    })

    it('prefers an existing precompressed .br sibling over compressing on the fly', async () => {
        const res = new FakeResponse()
        await serveStaticFile(path.join(distDir, 'big.txt'), fakeReq('br'), res)
        const decompressed = zlib.brotliDecompressSync(res.body).toString()
        expect(decompressed.startsWith('PRECOMPRESSED-BROTLI-')).toBe(true)
    })
})
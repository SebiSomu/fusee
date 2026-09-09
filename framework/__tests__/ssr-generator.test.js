import { describe, it, expect, beforeEach } from 'vitest'
import { compileSSR } from '../core/compiler/compile-ssr.js'
import { signal } from '../core/signal.js'
import { withSignalScope, extractSignalRegistrySnapshot, clearSignalRegistry } from '../core/signal-scope.js'
import { writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const TMP_DIR = path.resolve('compiler/.tmp')
let fileCounter = 0

async function loadCompiled(code) {
    await mkdir(TMP_DIR, { recursive: true })
    const file = path.join(TMP_DIR, `compiled-${fileCounter++}-${Date.now()}.mjs`)
    await writeFile(file, code, 'utf8')
    const mod = await import(pathToFileURL(file).href)
    return mod
}

beforeEach(() => {
    clearSignalRegistry()
})

describe('compileSSR — real template through the full lexer/parser/transformer/ssr-generator pipeline', () => {
    it('compiles a static + dynamic interpolation template and produces correctly anchored HTML', async () => {
        const source = `<div class="card"><h2>Hello, {{ name }}!</h2></div>`
        const { code } = compileSSR(source, { runtimePath: '../../framework/core/ssr.js' })

        expect(code).toContain('export async function renderSSR')
        expect(code).toContain('f-bind')

        const { renderSSR } = await loadCompiled(code)

        const html = await withSignalScope('page', async () => {
            const name = signal('Ana')
            return renderSSR({ name }, {})
        })

        expect(html).toBe('<div class="card"><h2>Hello, <!--f-bind:0-->Ana<!--/f-bind:0-->!</h2></div>')
    })

    it('compiles f-if branches with correct anchor comments and evaluated condition', async () => {
        const source = `<div><span f-if="loggedIn">Welcome</span><span f-else>Guest</span></div>`
        const { code } = compileSSR(source, { runtimePath: '../../framework/core/ssr.js' })
        const { renderSSR } = await loadCompiled(code)

        const htmlTrue = await renderSSR({ loggedIn: true }, {})
        expect(htmlTrue).toContain('<!--f-if:0-->')
        expect(htmlTrue).toContain('<span>Welcome</span>')
        expect(htmlTrue).toContain('<!--/f-if:0-->')
        expect(htmlTrue).not.toContain('Guest')

        const htmlFalse = await renderSSR({ loggedIn: false }, {})
        expect(htmlFalse).toContain('<span>Guest</span>')
        expect(htmlFalse).not.toContain('Welcome')
    })

    it('compiles f-for with per-item key anchors via ssrEnumerate', async () => {
        const source = `<ul><li f-for="item in items" :key="item.id">{{ item.name }}</li></ul>`
        const { code } = compileSSR(source, { runtimePath: '../../framework/core/ssr.js' })
        const { renderSSR } = await loadCompiled(code)

        const html = await renderSSR({ items: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] }, {})

        expect(html).toContain('<!--f-for:0-->')
        expect(html).toContain('<!--f-for-item:0:a-->')
        expect(html).toContain('Alpha')
        expect(html).toContain('<!--f-for-item:0:b-->')
        expect(html).toContain('Beta')
        expect(html).toContain('<!--/f-for:0-->')
    })

    it('escapes interpolated values to prevent injection', async () => {
        const source = `<p>{{ msg }}</p>`
        const { code } = compileSSR(source, { runtimePath: '../../framework/core/ssr.js' })
        const { renderSSR } = await loadCompiled(code)

        const html = await renderSSR({ msg: '<script>alert(1)</script>' }, {})
        expect(html).not.toContain('<script>alert(1)</script>')
        expect(html).toContain('&lt;script&gt;')
    })

    it('records positional signal state during the compiled setup+render, ready for dehydration', async () => {
        const source = `<p>{{ count }}</p>`
        const { code } = compileSSR(source, { runtimePath: '../../framework/core/ssr.js' })
        const { renderSSR } = await loadCompiled(code)

        await withSignalScope('counter-page', async () => {
            const count = signal(42)
            await renderSSR({ count }, {})
        })

        const snapshot = extractSignalRegistrySnapshot()
        expect(snapshot['counter-page']).toEqual([42])
    })
})
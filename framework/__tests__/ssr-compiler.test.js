import { describe, it, expect } from 'vitest'
import { compile } from '../core/compiler/main-compiler.js'
import { signal } from '../core/signal.js'
import * as ssrRuntime from '../core/ssr.js'

async function evaluateSSR(ssrCode, context = {}, components = {}) {
    const strippedCode = ssrCode
        .replace(/import \{.*?\} from ['"].*?['"]/g, '')
        .replace(/export\s+(async\s+)?function\s+renderSSR/, 'async function __renderSSR')
    const wrapper = new Function('runtime', '_ctx', '_components', `
        const { escapeHtml, escapeAttr, renderClass, renderStyle, ssrEnumerate, renderComponentSSR, ssrVal } = runtime;
        ${strippedCode}
        return (async () => __renderSSR(_ctx, _components))();
    `)
    return await wrapper(ssrRuntime, context, components)
}

describe('SSR Compiler & Generator (Phase 1)', () => {
    it('should compile basic static template to SSR string', async () => {
        const template = `<div class="card"><h1>Hello World</h1></div>`
        const { code, ssrCode } = compile(template, { target: 'ssr' })

        expect(ssrCode).toBeDefined()
        const html = await evaluateSSR(ssrCode)
        expect(html).toBe('<div class="card"><h1>Hello World</h1></div>')
    })

    it('should compile interpolations and signals with marker comments', async () => {
        const template = `<div>Hello {{ name }}! Count: {{ count }}</div>`
        const { ssrCode } = compile(template, { target: 'ssr' })

        const name = signal('Fusée')
        const count = signal(42)
        const html = await evaluateSSR(ssrCode, { name, count })

        expect(html).toContain('<!--f-bind:')
        expect(html).toContain('Fusée')
        expect(html).toContain('42')
        expect(html).toContain('<!--/f-bind:')
    })

    it('should handle f-if / f-else-if / f-else directives', async () => {
        const template = `
            <div>
                <p f-if="role === 'admin'">Admin View</p>
                <p f-else-if="role === 'editor'">Editor View</p>
                <p f-else>Guest View</p>
            </div>
        `
        const { ssrCode } = compile(template, { target: 'ssr' })

        const htmlAdmin = await evaluateSSR(ssrCode, { role: signal('admin') })
        expect(htmlAdmin).toContain('Admin View')
        expect(htmlAdmin).not.toContain('Guest View')

        const htmlGuest = await evaluateSSR(ssrCode, { role: signal('user') })
        expect(htmlGuest).toContain('Guest View')
        expect(htmlGuest).not.toContain('Admin View')
    })

    it('should handle f-for loops with keys and iteration markers', async () => {
        const template = `
            <ul>
                <li f-for="item in items" :key="item.id">{{ item.name }}</li>
            </ul>
        `
        const { ssrCode } = compile(template, { target: 'ssr' })

        const items = signal([
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' }
        ])

        const html = await evaluateSSR(ssrCode, { items })
        expect(html).toContain('<!--f-for:')
        expect(html).toContain('Item 1')
        expect(html).toContain('Item 2')
        expect(html).toContain('<!--/f-for:')
    })

    it('should handle dynamic class, style and f-show', async () => {
        const template = `<div :class="classes" :style="styles" f-show="visible">Content</div>`
        const { ssrCode } = compile(template, { target: 'ssr' })

        const html = await evaluateSSR(ssrCode, {
            classes: { active: true, hidden: false },
            styles: { fontSize: '16px' },
            visible: false
        })

        expect(html).toContain('class="active"')
        expect(html).toContain('style="font-size:16px"')
        expect(html).toContain('style="display:none"')
    })

    it('should support target: "both" returning both client and SSR code', () => {
        const template = `<button @click="increment">{{ count }}</button>`
        const result = compile(template, { target: 'both' })

        expect(result.code).toContain('h(')
        expect(result.ssrCode).toContain('async function renderSSR')
    })
})

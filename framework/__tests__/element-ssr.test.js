// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as ssrRuntime from '../core/ssr.js'
import { compile } from '../core/compiler/main-compiler.js'
import { defineComponent, provide, inject } from '../core/component.js'
import { defineElement, getElementDefinition, css } from '../core/element.js'
import { renderElementsSSR } from '../core/element-ssr.js'

let tagCounter = 0
const nextTag = () => `fu-ssr-${++tagCounter}`

/** Turns compiled SSR module code into a callable renderSSR(), as a bundler would. */
function loadSSRModule(ssrCode) {
    const body = ssrCode
        .replace(/^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];?/m, (_, names) => `const {${names}} = __runtime;`)
        .replace(/export\s+async\s+function\s+renderSSR/, 'async function renderSSR')
    return new Function('__runtime', `${body}\nreturn renderSSR`)(ssrRuntime)
}

/** Removes hydration comments so assertions read like the visible markup. */
const stripAnchors = (html) => html.replace(/<!--\/?f-[^>]*-->/g, '')

describe('defineElement without a DOM', () => {
    it('registers the definition and returns null', () => {
        expect(typeof customElements).toBe('undefined')
        const tag = nextTag()

        const result = defineElement(tag, { setup: () => ({ template: '' }) })

        expect(result).toBeNull()
        expect(getElementDefinition(tag).tagName).toBe(tag)
    })
})

describe('renderElementsSSR', () => {
    const cardTag = nextTag()
    defineElement(cardTag, {
        props: {
            title: { type: String, default: 'Untitled' },
            count: { type: Number, default: 2, reflect: true },
            items: { type: Array, default: () => [] }
        },
        styles: css`:host { display: block }`,
        setup: (props) => ({
            props,
            template: '<h2>{{ props.title }}</h2><ul><li f-for="item in props.items">{{ item }}</li></ul><slot name="foot"></slot><slot></slot>'
        })
    })

    it('renders declarative shadow DOM with styles and props from attributes', async () => {
        const html = await renderElementsSSR(`<${cardTag} title="A &amp; B" items="[&quot;x&quot;,&quot;y&quot;]"></${cardTag}>`)

        expect(stripAnchors(html)).toBe(
            `<${cardTag} title="A &amp; B" items="[&quot;x&quot;,&quot;y&quot;]" count="2">` +
            '<template shadowrootmode="open"><style>:host { display: block }</style>' +
            '<h2>A &amp; B</h2><ul><li>x</li><li>y</li></ul><slot name="foot"></slot><slot></slot>' +
            `</template></${cardTag}>`
        )
    })

    it('keeps light-DOM children after the shadow template', async () => {
        const html = await renderElementsSSR(`<${cardTag}><p slot="foot">footer</p>text</${cardTag}>`)

        expect(html).toMatch(new RegExp(`</template><p slot="foot">footer</p>text</${cardTag}>$`))
    })

    it('does not add a reflected attribute that is already present', async () => {
        const html = await renderElementsSSR(`<${cardTag} count="9"></${cardTag}>`)

        expect(html.startsWith(`<${cardTag} count="9"><template`)).toBe(true)
    })

    it('is idempotent on HTML that already has declarative shadow roots', async () => {
        const once = await renderElementsSSR(`<${cardTag}></${cardTag}>`)

        expect(await renderElementsSSR(once)).toBe(once)
    })

    it('renders elements nested in shadow content and in light children', async () => {
        const leafTag = nextTag()
        defineElement(leafTag, { props: ['label'], setup: (p) => ({ p, template: '<b>{{ p.label }}</b>' }) })
        const shellTag = nextTag()
        defineElement(shellTag, { setup: () => ({ template: `<${leafTag} label="inner"></${leafTag}><slot></slot>` }) })

        const html = stripAnchors(await renderElementsSSR(`<${shellTag}><${leafTag} label="outer"></${leafTag}></${shellTag}>`))

        expect(html).toContain(`<${leafTag} label="inner"><template shadowrootmode="open"><b>inner</b></template></${leafTag}>`)
        expect(html).toContain(`<${leafTag} label="outer"><template shadowrootmode="open"><b>outer</b></template></${leafTag}>`)
    })

    it('closes self-closing custom element tags', async () => {
        const tag = nextTag()
        defineElement(tag, { setup: () => ({ template: '<i>x</i>' }) })

        const html = stripAnchors(await renderElementsSSR(`<div><${tag} /></div>`))

        expect(html).toBe(`<div><${tag} ><template shadowrootmode="open"><i>x</i></template></${tag}></div>`)
    })

    it('honours closed mode and delegatesFocus', async () => {
        const tag = nextTag()
        defineElement(tag, { shadow: { mode: 'closed', delegatesFocus: true }, setup: () => ({ template: '<input>' }) })

        const html = await renderElementsSSR(`<${tag}></${tag}>`)

        expect(html).toContain('<template shadowrootmode="closed" shadowrootdelegatesfocus>')
    })

    it('leaves unregistered tags, light-DOM elements, and raw text untouched', async () => {
        const lightTag = nextTag()
        defineElement(lightTag, { shadow: false, setup: () => ({ template: '<p>light</p>' }) })
        const input = `<x-unknown a="1"></x-unknown><${lightTag}></${lightTag}>` +
            `<script>const s = "<${cardTag}>"</script><!-- <${cardTag}> --><textarea><${cardTag}></textarea>`

        expect(await renderElementsSSR(input)).toBe(input)
    })

    it('uses a compiled renderSSR() when the definition provides one', async () => {
        const tag = nextTag()
        const { ssrCode } = compile('<em>{{ props.name }}</em>', { target: 'ssr' })
        defineElement(tag, {
            props: { name: { type: String, default: 'n' } },
            setup: (props) => ({ props }),
            renderSSR: loadSSRModule(ssrCode)
        })

        const html = stripAnchors(await renderElementsSSR(`<${tag} name="compiled"></${tag}>`))

        expect(html).toContain('<em>compiled</em>')
    })

    it('renders fusée components used in element templates', async () => {
        const Price = defineComponent({
            props: ['amount'],
            setup: (props) => ({ props, template: '<span>${{ props.amount }}</span>' })
        })
        const tag = nextTag()
        defineElement(tag, { components: { Price }, setup: () => ({ template: '<Price :amount="12"></Price>' }) })

        const html = stripAnchors(await renderElementsSSR(`<${tag}></${tag}>`))

        expect(html).toContain('<span>$12</span>')
    })

    it('runs setup in an injection context', async () => {
        const tag = nextTag()
        defineElement(tag, {
            setup() {
                provide('greeting', 'hello')
                return { greeting: inject('greeting'), fallback: inject('missing', 'fb'), template: '{{ greeting }}-{{ fallback }}' }
            }
        })

        expect(stripAnchors(await renderElementsSSR(`<${tag}></${tag}>`))).toContain('hello-fb')
    })

    it('rejects elements that render themselves forever', async () => {
        const tag = nextTag()
        defineElement(tag, { setup: () => ({ template: `<${tag}></${tag}>` }) })

        await expect(renderElementsSSR(`<${tag}></${tag}>`)).rejects.toThrow(/nested deeper/)
    })

    it('renders rich props bound in compiled page templates', async () => {
        const page = loadSSRModule(compile(`<main><${cardTag} :items="list" :title="title"></${cardTag}></main>`, { target: 'ssr' }).ssrCode)

        const pageHtml = await page({ list: ['p', 'q'], title: 'Page' }, {})
        const html = stripAnchors(await renderElementsSSR(pageHtml))

        expect(pageHtml).toContain('items="[&quot;p&quot;,&quot;q&quot;]"')
        expect(html).toContain('<h2>Page</h2><ul><li>p</li><li>q</li></ul>')
    })
})

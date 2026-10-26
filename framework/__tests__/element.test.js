import { describe, it, expect, vi, afterEach } from 'vitest'
import { signal, effect } from '../core/signal.js'
import { defineComponent, onMount, onUnmount } from '../core/component.js'
import { mountTemplate } from '../core/compiler.js'
import { h } from '../core/h.js'
import { defineElement, toCustomElement, css, unsafeCSS } from '../core/element.js'

let tagCounter = 0
const nextTag = () => `fu-test-${++tagCounter}`
const flushMicrotasks = () => new Promise(resolve => queueMicrotask(resolve))
const click = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

/** Creates an element, optionally sets attributes, and attaches it to the document. */
function create(tag, attrs = {}) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    document.body.appendChild(el)
    return el
}

afterEach(() => {
    document.body.innerHTML = ''
    document.head.querySelectorAll('style[data-fusee-element]').forEach(s => s.remove())
})

describe('defineElement rendering', () => {
    it('renders the template into an open shadow root with default props', () => {
        const tag = nextTag()
        defineElement(tag, {
            props: { label: { type: String, default: 'Clicks' }, count: { type: Number, default: 0 } },
            setup: (props) => ({ props, template: '<span>{{ props.label }}: {{ props.count }}</span>' })
        })

        const el = create(tag)

        expect(el.shadowRoot.querySelector('span').textContent).toBe('Clicks: 0')
    })

    it('returns the existing class with a warning when a tag is defined twice', () => {
        const tag = nextTag()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const First = defineElement(tag, { setup: () => ({ template: '' }) })
        const Second = defineElement(tag, { setup: () => ({ template: '' }) })

        expect(Second).toBe(First)
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    it('renders compiled render functions through h()', () => {
        const tag = nextTag()
        defineElement(tag, {
            props: { name: { type: String, default: 'x' } },
            setup: (props) => ({ props }),
            render: (ctx) => [h('b', {}, [])].map(fnode => {
                fnode.node.textContent = ctx.props.name
                return fnode
            })
        })

        const el = create(tag, { name: 'compiled' })

        expect(el.shadowRoot.querySelector('b').textContent).toBe('compiled')
    })
})

describe('props and attributes', () => {
    const tag = nextTag()
    defineElement(tag, {
        props: {
            count: { type: Number, default: 0 },
            active: { type: Boolean, default: false },
            items: { type: Array, default: () => [] },
            userName: { type: String, default: 'anon' },
            secret: { type: Object, attribute: false }
        },
        setup: (props) => ({
            props,
            template: '<p>{{ props.count }}|{{ props.active }}|{{ props.items.length }}|{{ props.userName }}</p>'
        })
    })
    const text = (el) => el.shadowRoot.querySelector('p').textContent

    it('converts attributes to typed props', () => {
        const el = create(tag, { count: '5', active: '', items: '[1,2,3]', 'user-name': 'ada' })

        expect(el.count).toBe(5)
        expect(el.active).toBe(true)
        expect(el.items).toEqual([1, 2, 3])
        expect(el.userName).toBe('ada')
        expect(text(el)).toBe('5|true|3|ada')
    })

    it('resets a prop to its default when its attribute is removed', () => {
        const el = create(tag, { count: '5', active: '' })

        el.removeAttribute('count')
        el.removeAttribute('active')

        expect(el.count).toBe(0)
        expect(el.active).toBe(false)
    })

    it('updates the shadow DOM when a property is set', () => {
        const el = create(tag)

        el.count = 9
        el.items = ['a']

        expect(text(el)).toBe('9|false|1|anon')
    })

    it('gives each instance its own factory default', () => {
        const a = create(tag)
        const b = create(tag)

        expect(a.items).not.toBe(b.items)
    })

    it('does not observe props declared with attribute: false', () => {
        const El = customElements.get(tag)
        expect(El.observedAttributes).toEqual(['count', 'active', 'items', 'user-name'])

        const el = create(tag, { secret: '{"a":1}' })
        expect(el.secret).toBeUndefined()
    })

    it('reflects props back to attributes when reflect is set', () => {
        const reflectTag = nextTag()
        defineElement(reflectTag, {
            props: {
                count: { type: Number, default: 1, reflect: true },
                open: { type: Boolean, default: false, reflect: true }
            },
            setup: (props) => ({ props, template: '<i>{{ props.count }}</i>' })
        })
        const el = create(reflectTag)
        expect(el.getAttribute('count')).toBe('1')
        expect(el.hasAttribute('open')).toBe(false)

        el.count = 4
        el.open = true
        expect(el.getAttribute('count')).toBe('4')
        expect(el.hasAttribute('open')).toBe(true)

        el.setAttribute('count', '7')
        expect(el.count).toBe(7)
        expect(el.shadowRoot.querySelector('i').textContent).toBe('7')
    })

    it('supports custom converters and attribute names', () => {
        const customTag = nextTag()
        defineElement(customTag, {
            props: {
                tags: {
                    attribute: 'data-tags',
                    converter: { fromAttribute: (v) => v ? v.split(',') : undefined }
                }
            },
            setup: (props) => ({ props, template: '' })
        })

        const el = create(customTag, { 'data-tags': 'a,b' })

        expect(el.tags).toEqual(['a', 'b'])
    })

    it('applies properties that were set before the element was defined', () => {
        const lateTag = nextTag()
        const el = create(lateTag)
        el.items = [1, 2]
        el.userdata = { id: 1 }

        defineElement(lateTag, {
            props: { items: { type: Array }, userData: { type: Object } },
            setup: (props) => ({ props, template: '<p>{{ props.items.length }}</p>' })
        })

        expect(el.items).toEqual([1, 2])
        expect(el.userData).toEqual({ id: 1 })
        expect(Object.prototype.hasOwnProperty.call(el, 'items')).toBe(false)
        expect(el.shadowRoot.querySelector('p').textContent).toBe('2')
    })

    it('reports missing required props', () => {
        const requiredTag = nextTag()
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        defineElement(requiredTag, {
            props: { id: { type: String, required: true } },
            setup: () => ({ template: '' })
        })

        create(requiredTag)

        expect(error).toHaveBeenCalledWith(expect.stringContaining('required prop "id"'))
        error.mockRestore()
    })
})

describe('setup context and events', () => {
    it('passes host and shadowRoot to setup', () => {
        const tag = nextTag()
        let ctx
        defineElement(tag, {
            setup: (props, setupCtx) => {
                ctx = setupCtx
                return { template: '' }
            }
        })

        const el = create(tag)

        expect(ctx.host).toBe(el)
        expect(ctx.shadowRoot).toBe(el.shadowRoot)
        expect(typeof ctx.emit).toBe('function')
    })

    it('emits composed CustomEvents from the host', () => {
        const tag = nextTag()
        defineElement(tag, {
            setup: (props, { emit }) => ({
                fire: () => emit('picked', { id: 3 }),
                template: '<button @click="fire">pick</button>'
            })
        })
        const el = create(tag)
        const received = []
        document.body.addEventListener('picked', (e) => received.push([e.target, e.detail, e.composed]))

        click(el.shadowRoot.querySelector('button'))

        expect(received).toEqual([[el, { id: 3 }, true]])
    })

    it('lets setup write props through the host', () => {
        const tag = nextTag()
        defineElement(tag, {
            props: { count: { type: Number, default: 0, reflect: true } },
            setup: (props, { host }) => ({
                props,
                inc: () => { host.count = props.count + 1 },
                template: '<button @click="inc">{{ props.count }}</button>'
            })
        })
        const el = create(tag)
        const button = el.shadowRoot.querySelector('button')

        click(button)
        click(button)

        expect(button.textContent).toBe('2')
        expect(el.getAttribute('count')).toBe('2')
    })
})

describe('slots and shadow modes', () => {
    it('distributes light-DOM children into native slots', () => {
        const tag = nextTag()
        defineElement(tag, {
            setup: () => ({ template: '<header><slot name="title"></slot></header><slot>fallback</slot>' })
        })
        const el = document.createElement(tag)
        el.innerHTML = '<span slot="title">Hi</span><p>body</p>'
        document.body.appendChild(el)

        const [titleSlot, defaultSlot] = el.shadowRoot.querySelectorAll('slot')
        expect(titleSlot.assignedNodes().map(n => n.textContent)).toEqual(['Hi'])
        expect(defaultSlot.assignedElements().map(n => n.tagName)).toEqual(['P'])
    })

    it('handles delegated events inside a closed shadow root', () => {
        const tag = nextTag()
        const clicks = signal(0)
        let root
        defineElement(tag, {
            shadow: 'closed',
            setup: (props, { shadowRoot }) => {
                root = shadowRoot
                return { inc: () => clicks(clicks() + 1), template: '<button @click="inc">+</button>' }
            }
        })
        const el = create(tag)

        expect(el.shadowRoot).toBeNull()
        click(root.querySelector('button'))
        expect(clicks()).toBe(1)
    })

    it('renders into the host and resolves string slots in light-DOM mode', () => {
        const tag = nextTag()
        defineElement(tag, {
            shadow: false,
            styles: css`.card { color: red; }`,
            setup: () => ({ template: '<div class="card"><slot></slot></div>' })
        })
        const el = document.createElement(tag)
        el.innerHTML = '<b>inside</b>'
        document.body.appendChild(el)

        expect(el.shadowRoot).toBeNull()
        expect(el.querySelector('.card b').textContent).toBe('inside')
        expect(document.head.querySelector(`style[data-fusee-element="${tag}"]`).textContent).toContain('.card')
    })
})

describe('styles', () => {
    it('adds <style> elements to the shadow root when adoptedStyleSheets is unavailable', () => {
        const tag = nextTag()
        const accent = css`red`
        defineElement(tag, {
            styles: [css`:host { color: ${accent}; padding: ${4}px; }`, unsafeCSS('p { margin: 0 }')],
            setup: () => ({ template: '<p>x</p>' })
        })

        const el = create(tag)
        const styles = [...el.shadowRoot.querySelectorAll('style')].map(s => s.textContent)

        expect(styles).toEqual([':host { color: red; padding: 4px; }', 'p { margin: 0 }'])
    })

    it('rejects plain string interpolation in css``', () => {
        expect(() => css`a { color: ${'red'} }`).toThrow(TypeError)
    })
})

describe('lifecycle', () => {
    /** Defines an element that counts setup, mount, and unmount calls. */
    function defineCounted() {
        const tag = nextTag()
        const calls = { setup: 0, mount: 0, unmount: 0 }
        const source = signal('a')
        defineElement(tag, {
            setup: () => {
                calls.setup++
                onMount(() => calls.mount++)
                onUnmount(() => calls.unmount++)
                return { source, template: '<p>{{ source }}</p>' }
            }
        })
        return { tag, calls, source }
    }

    it('keeps state when the element is moved within the same task', async () => {
        const { tag, calls } = defineCounted()
        const el = create(tag)
        const other = document.createElement('section')
        document.body.appendChild(other)

        other.appendChild(el)
        await flushMicrotasks()

        expect(calls).toEqual({ setup: 1, mount: 1, unmount: 0 })
    })

    it('unmounts and stops updating after removal', async () => {
        const { tag, calls, source } = defineCounted()
        const el = create(tag)
        const p = el.shadowRoot.querySelector('p')

        el.remove()
        await flushMicrotasks()
        source('b')

        expect(calls.unmount).toBe(1)
        expect(p.textContent).toBe('a')
    })

    it('sets up again when re-added after removal', async () => {
        const { tag, calls, source } = defineCounted()
        const el = create(tag)
        el.remove()
        await flushMicrotasks()

        document.body.appendChild(el)
        source('c')

        expect(calls.setup).toBe(2)
        expect(el.shadowRoot.querySelector('p').textContent).toBe('c')
    })

    it('keeps working after the effect that connected it is disposed', () => {
        const { tag, source } = defineCounted()
        let el
        const stop = effect(() => {
            el = create(tag)
        })

        stop()
        source('after')

        expect(el.shadowRoot.querySelector('p').textContent).toBe('after')
    })

    it('does not subscribe the connecting effect to signals read during setup', () => {
        const tag = nextTag()
        const readInSetup = signal(0)
        defineElement(tag, {
            setup: () => {
                readInSetup()
                return { template: '' }
            }
        })
        let runs = 0
        const stop = effect(() => {
            runs++
            if (runs === 1) create(tag)
        })

        readInSetup(1)

        expect(runs).toBe(1)
        stop()
    })
})

describe('integration with fusée templates', () => {
    const tag = nextTag()
    defineElement(tag, {
        props: { items: { type: Array, default: () => [] } },
        setup: (props) => ({ props, template: '<ul><li f-for="item in props.items">{{ item }}</li></ul>' })
    })
    const itemsText = (el) => [...el.shadowRoot.querySelectorAll('li')].map(li => li.textContent)

    it('receives reactive arrays from a string template binding', () => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const list = signal(['a', 'b'])
        const { effects } = mountTemplate(`<${tag} :items="list"></${tag}>`, container, { list }, {})
        const el = container.querySelector(tag)

        expect(itemsText(el)).toEqual(['a', 'b'])
        list(['c'])
        expect(itemsText(el)).toEqual(['c'])
        effects.forEach(fn => fn())
    })

    it('receives arrays through h()', () => {
        const list = signal([1, 2, 3])
        const { node } = h(tag, { items: () => list() }, [])
        document.body.appendChild(node)

        expect(itemsText(node)).toEqual(['1', '2', '3'])
    })

    it('listens to emitted events with @event in string templates', () => {
        const childTag = nextTag()
        defineElement(childTag, {
            setup: (props, { emit }) => ({ fire: () => emit('saved', 42), template: '<button @click="fire">s</button>' })
        })
        const container = document.createElement('div')
        document.body.appendChild(container)
        const got = []
        mountTemplate(`<${childTag} @saved="onSaved"></${childTag}>`, container, { onSaved: (e) => got.push(e.detail) }, {})

        click(container.querySelector(childTag).shadowRoot.querySelector('button'))

        expect(got).toEqual([42])
    })
})

describe('toCustomElement', () => {
    it('registers an existing component as a custom element', () => {
        const Badge = defineComponent({
            props: { text: { type: String, default: 'new' } },
            setup: (props) => ({ props, template: '<em>{{ props.text }}</em>' })
        })
        const tag = nextTag()

        toCustomElement(Badge, tag, { styles: css`em { font-weight: bold }` })
        const el = create(tag, { text: 'hot' })

        expect(el.shadowRoot.querySelector('em').textContent).toBe('hot')
        expect(el.shadowRoot.querySelector('style').textContent).toContain('em')
    })

    it('rejects values that are not defineComponent() components', () => {
        expect(() => toCustomElement(() => {}, nextTag())).toThrow(TypeError)
    })
})

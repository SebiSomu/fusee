import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, provide, inject, getCurrentInstance } from '../core/component.js'
import { createApp } from '../core/app-registry.js'
import { InjectionToken } from '../core/di.js'
import { defineElement } from '../core/element.js'
import { requestContext, FUSEE_PARENT_CONTEXT } from '../core/context.js'

let tagCounter = 0
const nextTag = () => `fu-ctx-${++tagCounter}`

/** Defines an element that records what inject(key, fallback) returned during setup. */
function defineConsumer(key, fallback) {
    const tag = nextTag()
    const seen = []
    defineElement(tag, {
        setup: () => {
            seen.push(inject(key, fallback))
            return { template: '' }
        }
    })
    return { tag, seen }
}

/** Creates a connected container so custom elements upgrade and connect while rendering. */
function connectedContainer() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    return container
}

/** Answers context-request events for one key from a plain DOM ancestor, like @lit/context does. */
function addForeignProvider(el, key, value) {
    el.addEventListener('context-request', (e) => {
        if (e.context !== key) return
        e.stopPropagation()
        e.callback(value)
    })
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('fusée providers reaching custom elements', () => {
    it('injects values provided by an enclosing component', () => {
        const { tag, seen } = defineConsumer('theme')
        const Parent = defineComponent({
            setup() {
                provide('theme', 'dark')
                return { template: `<${tag}></${tag}>` }
            }
        })

        Parent().render(connectedContainer())

        expect(seen).toEqual(['dark'])
    })

    it('injects values provided at the app level', () => {
        const { tag, seen } = defineConsumer('locale')
        const Root = defineComponent({ setup: () => ({ template: `<${tag}></${tag}>` }) })

        createApp(Root).provide('locale', 'ro').mount(connectedContainer())

        expect(seen).toEqual(['ro'])
    })

    it('injects values from an element into elements rendered in its shadow root', () => {
        const { tag: innerTag, seen } = defineConsumer('size')
        const outerTag = nextTag()
        defineElement(outerTag, {
            setup() {
                provide('size', 'lg')
                return { template: `<${innerTag}></${innerTag}>` }
            }
        })

        connectedContainer().appendChild(document.createElement(outerTag))

        expect(seen).toEqual(['lg'])
    })

    it('injects values from an element into its slotted children', () => {
        const { tag: innerTag, seen } = defineConsumer('size')
        const outerTag = nextTag()
        defineElement(outerTag, {
            setup() {
                provide('size', 'sm')
                return { template: '<slot></slot>' }
            }
        })

        connectedContainer().innerHTML = `<${outerTag}><${innerTag}></${innerTag}></${outerTag}>`

        expect(seen).toEqual(['sm'])
    })

    it('resolves to the nearest provider', () => {
        const { tag: leafTag, seen } = defineConsumer('level')
        const midTag = nextTag()
        defineElement(midTag, {
            setup() {
                provide('level', 'mid')
                return { template: `<${leafTag}></${leafTag}>` }
            }
        })
        const Root = defineComponent({
            setup() {
                provide('level', 'root')
                return { template: `<${midTag}></${midTag}>` }
            }
        })

        Root().render(connectedContainer())

        expect(seen).toEqual(['mid'])
    })

    it('resolves InjectionToken and useClass providers across the boundary', () => {
        class Logger { log() { return 'ok' } }
        const API_URL = new InjectionToken('API_URL')
        const tag = nextTag()
        let injected
        defineElement(tag, {
            setup() {
                injected = { url: inject(API_URL), logger: inject(Logger) }
                return { template: '' }
            }
        })
        const Root = defineComponent({
            setup() {
                provide(API_URL, '/api')
                provide(Logger, { useClass: Logger })
                return { template: `<${tag}></${tag}>` }
            }
        })

        Root().render(connectedContainer())

        expect(injected.url).toBe('/api')
        expect(injected.logger).toBeInstanceOf(Logger)
    })

    it('falls back to the default, or throws, when nothing provides the key', () => {
        const { tag, seen } = defineConsumer('missing', 'fallback')
        connectedContainer().appendChild(document.createElement(tag))
        expect(seen).toEqual(['fallback'])

        const throwingTag = nextTag()
        let error
        defineElement(throwingTag, {
            setup() {
                try { inject('missing') } catch (e) { error = e }
                return { template: '' }
            }
        })
        connectedContainer().appendChild(document.createElement(throwingTag))
        expect(error?.message).toContain('NullInjectorError')
    })

    it('links the element instance to the enclosing component instance', () => {
        const tag = nextTag()
        let elementInstance
        defineElement(tag, {
            setup() {
                elementInstance = getCurrentInstance()
                return { template: '' }
            }
        })
        const api = defineComponent({ setup: () => ({ template: `<${tag}></${tag}>` }) })()

        api.render(connectedContainer())

        expect(elementInstance._parent).toBe(api.instance)
    })

    it('makes app-registered components usable in element templates', () => {
        const Badge = defineComponent({ setup: () => ({ template: '<b>badge</b>' }) })
        const tag = nextTag()
        defineElement(tag, { setup: () => ({ template: '<Badge></Badge>' }) })
        const Root = defineComponent({ setup: () => ({ template: `<${tag}></${tag}>` }) })
        const container = connectedContainer()

        createApp(Root).component('Badge', Badge).mount(container)

        expect(container.querySelector(tag).shadowRoot.querySelector('b').textContent).toBe('badge')
    })

    it('stops answering after the providing component unmounts', () => {
        const container = connectedContainer()
        const api = defineComponent({ setup: () => ({ template: '<p></p>' }) })()
        api.render(container)
        const probe = document.createElement('span')
        container.querySelector('p').appendChild(probe)
        expect(requestContext(probe, FUSEE_PARENT_CONTEXT).value).toBe(api.instance)

        api.unmount()
        container.appendChild(probe)

        expect(requestContext(probe, FUSEE_PARENT_CONTEXT).found).toBe(false)
    })
})

describe('Context Protocol interop', () => {
    it('lets elements inject values from foreign providers', () => {
        const { tag, seen } = defineConsumer('lit-theme')
        const wrapper = connectedContainer()
        addForeignProvider(wrapper, 'lit-theme', 'from-lit')

        wrapper.appendChild(document.createElement(tag))

        expect(seen).toEqual(['from-lit'])
    })

    it('lets components nested inside an element reach foreign providers', () => {
        const seen = []
        const Inner = defineComponent({
            setup() {
                seen.push(inject('lit-theme'))
                return { template: '' }
            }
        })
        const tag = nextTag()
        defineElement(tag, { components: { Inner }, setup: () => ({ template: '<Inner></Inner>' }) })
        const wrapper = connectedContainer()
        addForeignProvider(wrapper, 'lit-theme', 'deep')

        wrapper.appendChild(document.createElement(tag))

        expect(seen).toEqual(['deep'])
    })

    it('prefers fusée providers over foreign ones further up', () => {
        const { tag, seen } = defineConsumer('mode')
        const wrapper = connectedContainer()
        addForeignProvider(wrapper, 'mode', 'foreign')
        const Root = defineComponent({
            setup() {
                provide('mode', 'fusee')
                return { template: `<${tag}></${tag}>` }
            }
        })

        Root().render(wrapper.appendChild(document.createElement('div')))

        expect(seen).toEqual(['fusee'])
    })

    it('does not ask foreign providers when inject() is called with { self: true }', () => {
        const tag = nextTag()
        let result
        defineElement(tag, {
            setup() {
                result = inject('lit-theme', { self: true, optional: true })
                return { template: '' }
            }
        })
        const wrapper = connectedContainer()
        addForeignProvider(wrapper, 'lit-theme', 'from-lit')

        wrapper.appendChild(document.createElement(tag))

        expect(result).toBeNull()
    })

    it('answers foreign consumers inside an element with values it provides', () => {
        const tag = nextTag()
        defineElement(tag, {
            setup() {
                provide('theme', 'neon')
                return { template: '<span class="consumer"></span><slot></slot>' }
            }
        })
        const wrapper = connectedContainer()
        const outerHeard = []
        wrapper.addEventListener('context-request', (e) => outerHeard.push(e.context))
        wrapper.innerHTML = `<${tag}><i class="slotted"></i></${tag}>`
        const el = wrapper.querySelector(tag)

        const fromShadow = requestContext(el.shadowRoot.querySelector('.consumer'), 'theme')
        const fromSlot = requestContext(el.querySelector('.slotted'), 'theme')

        expect([fromShadow.value, fromSlot.value]).toEqual(['neon', 'neon'])
        expect(outerHeard).not.toContain('theme')
    })

    it('does not answer a light-DOM element\'s own requests', () => {
        const tag = nextTag()
        defineElement(tag, {
            shadow: false,
            setup() {
                provide('k', 'self')
                return { template: '' }
            }
        })
        const wrapper = connectedContainer()
        addForeignProvider(wrapper, 'k', 'ancestor')
        wrapper.innerHTML = `<${tag}></${tag}>`

        expect(requestContext(wrapper.querySelector(tag), 'k').value).toBe('ancestor')
    })
})

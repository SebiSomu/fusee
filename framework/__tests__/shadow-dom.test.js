import { describe, it, expect, afterEach } from 'vitest'
import { signal } from '../core/signal.js'
import { mountTemplate } from '../core/compiler.js'
import { defineComponent } from '../core/component.js'
import { h, hSlot, NATIVE_SLOTS } from '../core/h.js'
import { installDelegationRoot } from '../core/event-delegation.js'
import { resolveElementProperty, isCustomElement } from '../core/element-props.js'

const click = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

/** Creates a host attached to the document with a shadow root of the given mode. */
function createHost(mode = 'open', parent = document.body) {
    const host = document.createElement('div')
    parent.appendChild(host)
    const root = host.attachShadow({ mode })
    return { host, root }
}

const cleanups = []

afterEach(() => {
    while (cleanups.length) cleanups.pop()()
    document.body.innerHTML = ''
})

/** Mounts a string template and registers its effects for cleanup after the test. */
function mount(template, container, context) {
    const { effects } = mountTemplate(template, container, context, {})
    cleanups.push(() => effects.forEach(fn => fn()))
    return effects
}

describe('event delegation across shadow boundaries', () => {
    it('fires delegated handlers inside an open shadow root', () => {
        const { root } = createHost('open')
        const calls = []
        mount('<button @click="onClick">go</button>', root, { onClick: () => calls.push('inner') })

        click(root.querySelector('button'))

        expect(calls).toEqual(['inner'])
    })

    it('keeps bubbling order from shadow content out to light-DOM ancestors', () => {
        const outer = document.createElement('section')
        document.body.appendChild(outer)
        const calls = []
        mount('<div @click="onOuter"><span class="slot-host"></span></div>', outer, {
            onOuter: () => calls.push('outer')
        })

        const { root } = createHost('open', outer.querySelector('.slot-host'))
        mount('<div @click="onWrap"><button @click="onButton">go</button></div>', root, {
            onWrap: () => calls.push('wrap'),
            onButton: () => calls.push('button')
        })

        click(root.querySelector('button'))

        expect(calls).toEqual(['button', 'wrap', 'outer'])
    })

    it('does not reach into a closed shadow root without installDelegationRoot', () => {
        const { root } = createHost('closed')
        const calls = []
        mount('<button @click="onClick">go</button>', root, { onClick: () => calls.push('inner') })

        click(root.querySelector('button'))

        expect(calls).toEqual([])
    })

    it('fires once, in bubbling order, inside an installed closed shadow root', () => {
        const wrapper = document.createElement('div')
        document.body.appendChild(wrapper)
        const calls = []
        mount('<div @click="onOuter" class="mount"></div>', wrapper, { onOuter: () => calls.push('outer') })

        const { root } = createHost('closed', wrapper.querySelector('.mount'))
        cleanups.push(installDelegationRoot(root))
        mount('<div @click="onWrap"><button @click="onButton">go</button></div>', root, {
            onWrap: () => calls.push('wrap'),
            onButton: () => calls.push('button')
        })

        click(root.querySelector('button'))

        expect(calls).toEqual(['button', 'wrap', 'outer'])
    })

    it('handles events that target a closed-root host directly', () => {
        const wrapper = document.createElement('div')
        document.body.appendChild(wrapper)
        const calls = []
        mount('<div @click="onOuter" class="mount"></div>', wrapper, { onOuter: () => calls.push('outer') })

        const { host, root } = createHost('closed', wrapper.querySelector('.mount'))
        cleanups.push(installDelegationRoot(root))

        click(host)

        expect(calls).toEqual(['outer'])
    })

    it('routes events through nested closed shadow roots', () => {
        const calls = []
        const { root: outerRoot } = createHost('closed')
        cleanups.push(installDelegationRoot(outerRoot))
        mount('<div @click="onOuterShadow" class="mount"></div>', outerRoot, {
            onOuterShadow: () => calls.push('outer-shadow')
        })

        const { root: innerRoot } = createHost('closed', outerRoot.querySelector('.mount'))
        cleanups.push(installDelegationRoot(innerRoot))
        mount('<button @click="onButton">go</button>', innerRoot, { onButton: () => calls.push('button') })

        click(innerRoot.querySelector('button'))

        expect(calls).toEqual(['button', 'outer-shadow'])
    })

    it('does not double-fire when an open root is also installed', () => {
        const { root } = createHost('open')
        cleanups.push(installDelegationRoot(root))
        const calls = []
        mount('<button @click="onClick">go</button>', root, { onClick: () => calls.push('inner') })

        click(root.querySelector('button'))
        click(root.querySelector('button'))

        expect(calls).toEqual(['inner', 'inner'])
    })

    it('stops dispatching into a closed root after uninstall', () => {
        const { root } = createHost('closed')
        const uninstall = installDelegationRoot(root)
        const calls = []
        mount('<button @click="onClick">go</button>', root, { onClick: () => calls.push('inner') })

        uninstall()
        click(root.querySelector('button'))

        expect(calls).toEqual([])
    })

    it('attaches listeners for event types registered after the root was installed', () => {
        const { root } = createHost('closed')
        cleanups.push(installDelegationRoot(root))
        const calls = []
        mount('<input @input="onInput">', root, { onInput: () => calls.push('input') })

        root.querySelector('input').dispatchEvent(new Event('input', { bubbles: true, composed: true }))

        expect(calls).toEqual(['input'])
    })
})

describe('native slots', () => {
    it('hSlot emits a real <slot> with fallback content in native mode', () => {
        const named = hSlot({ [NATIVE_SLOTS]: true }, 'header', [h('b', {}, [])])
        const fallbackDefault = hSlot({ [NATIVE_SLOTS]: true }, 'default', [])

        expect(named.node.tagName).toBe('SLOT')
        expect(named.node.getAttribute('name')).toBe('header')
        expect(named.node.querySelector('b')).not.toBeNull()
        expect(fallbackDefault.node.tagName).toBe('SLOT')
        expect(fallbackDefault.node.hasAttribute('name')).toBe(false)
    })

    it('hSlot keeps its comment-anchor behaviour by default', () => {
        const fnode = hSlot({}, 'default', [])
        expect(fnode.node.nodeType).toBe(Node.COMMENT_NODE)
        expect(fnode._isSlot).toBe(true)
    })

    it('keeps <slot> in string templates when _nativeSlots is set', () => {
        const { host, root } = createHost('open')
        host.innerHTML = '<span slot="title">Hello</span><p>body</p>'

        const api = defineComponent({
            _nativeSlots: true,
            setup: () => ({ template: '<h1><slot name="title"></slot></h1><slot></slot>' })
        })()
        api.render(root)
        cleanups.push(() => api.unmount())

        const [titleSlot, defaultSlot] = root.querySelectorAll('slot')
        expect(titleSlot.getAttribute('name')).toBe('title')
        expect(titleSlot.assignedNodes().map(n => n.textContent)).toEqual(['Hello'])
        expect(defaultSlot.assignedElements().map(n => n.tagName)).toEqual(['P'])
    })

    it('still resolves slots into the template without _nativeSlots', () => {
        const container = document.createElement('div')
        const api = defineComponent({
            setup: () => ({ template: '<h1><slot name="title"></slot></h1>' })
        })({}, { slots: { title: 'Hello' } })
        api.render(container)
        cleanups.push(() => api.unmount())

        expect(container.querySelector('slot')).toBeNull()
        expect(container.querySelector('h1').textContent).toBe('Hello')
    })

    it('hands compiled render functions a native slots context when _nativeSlots is set', () => {
        const { root } = createHost('open')
        const api = defineComponent({
            _nativeSlots: true,
            setup: () => ({}),
            render: (ctx) => [hSlot(ctx._slots, 'default', [])]
        })()
        api.render(root)
        cleanups.push(() => api.unmount())

        expect(root.querySelector('slot')).not.toBeNull()
    })
})

describe('property bindings on custom elements', () => {
    class PropsElement extends HTMLElement {
        constructor() {
            super()
            this._items = undefined
            this._userData = undefined
        }
        get items() { return this._items }
        set items(v) { this._items = v }
        get userData() { return this._userData }
        set userData(v) { this._userData = v }
    }
    customElements.define('fu-props-el', PropsElement)

    it('sets array bindings as properties in string templates', () => {
        const container = document.createElement('div')
        const list = signal(['a', 'b'])
        mount('<fu-props-el :items="list"></fu-props-el>', container, { list })

        const el = container.querySelector('fu-props-el')
        expect(el.items).toEqual(['a', 'b'])
        expect(el.hasAttribute('items')).toBe(false)

        list(['c'])
        expect(el.items).toEqual(['c'])
    })

    it('matches camelCase properties despite the parser lowercasing attribute names', () => {
        const container = document.createElement('div')
        const data = { id: 1 }
        mount('<fu-props-el :userData="data"></fu-props-el>', container, { data })

        expect(container.querySelector('fu-props-el').userData).toBe(data)
    })

    it('accepts kebab-case bindings for camelCase properties', () => {
        const container = document.createElement('div')
        const data = { id: 2 }
        mount('<fu-props-el :user-data="data"></fu-props-el>', container, { data })

        expect(container.querySelector('fu-props-el').userData).toBe(data)
    })

    it('sets rich values as properties on elements that are not defined yet', () => {
        const container = document.createElement('div')
        const list = signal([1, 2])
        mount('<fu-not-defined :items="list" :label="name"></fu-not-defined>', container, { list, name: 'x' })

        const el = container.querySelector('fu-not-defined')
        expect(el.items).toEqual([1, 2])
        expect(el.getAttribute('label')).toBe('x')
    })

    it('sets rich values as properties through h()', () => {
        const list = signal([1, 2, 3])
        const { node, effects } = h('fu-props-el', { items: () => list(), userData: { a: 1 } }, [])
        cleanups.push(() => effects.forEach(fn => fn()))

        expect(node.items).toEqual([1, 2, 3])
        expect(node.userData).toEqual({ a: 1 })

        list([4])
        expect(node.items).toEqual([4])
    })

    it('leaves native and SVG elements on the existing attribute path', () => {
        const svgFontFace = document.createElementNS('http://www.w3.org/2000/svg', 'font-face')
        expect(isCustomElement(svgFontFace)).toBe(false)
        expect(resolveElementProperty(document.createElement('div'), 'items', [1])).toBeNull()

        const { node } = h('div', { 'data-x': 'y' }, [])
        expect(node.getAttribute('data-x')).toBe('y')
    })
})

describe('string template attribute bindings', () => {
    it('binds the first and every following :attr on a tag', () => {
        const container = document.createElement('div')
        const title = signal('hi')
        mount('<div :title="title" class="a" :lang="lang" :dir="dir"></div>', container, { title, lang: 'en', dir: 'rtl' })

        const div = container.querySelector('div')
        expect([div.title, div.lang, div.dir]).toEqual(['hi', 'en', 'rtl'])
        expect(div.getAttribute('class')).toBe('a')

        title('bye')
        expect(div.title).toBe('bye')
    })

    it('leaves quoted values containing colons and > untouched', () => {
        const container = document.createElement('div')
        mount('<div :title="n > 1 ? \'a :b=c\' : \'d\'"></div>', container, { n: 2 })

        expect(container.querySelector('div').title).toBe('a :b=c')
    })

    it('still passes reactive props to child components', () => {
        const container = document.createElement('div')
        const count = signal(1)
        const Child = defineComponent({
            props: ['count', 'label'],
            setup: (props) => ({ props, template: '<span>{{ props.label }}:{{ props.count }}</span>' })
        })
        const { effects } = mountTemplate('<Child :count="count" :label="label"></Child>', container, { count, label: 'n' }, { Child })
        cleanups.push(() => effects.forEach(fn => fn()))

        expect(container.querySelector('span').textContent).toBe('n:1')
        count(5)
        expect(container.querySelector('span').textContent).toBe('n:5')
    })
})

describe('f-ref inside a shadow root', () => {
    it('writes the element into the ref signal', () => {
        const { root } = createHost('open')
        const inputRef = signal(null)
        mount('<input f-ref="inputRef">', root, { inputRef })

        expect(inputRef()).toBe(root.querySelector('input'))
    })
})

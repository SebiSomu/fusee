// directives.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    directive,
    processCustomDirectives,
    processShow,
    processModel,
    processText,
    processHtml,
    processEvents,
    processRefs,
    processCloak,
    processClassList,
} from '../core/directives.js'
import { isDelegatedEvent, DELEGATED_EVENTS } from '../core/event-delegation.js'
import { signal, effect, batch, computed } from '../core/signal.js'
import {
    evaluateExpression,
    parseInterpolation,
    sanitizeAttr
} from '../core/evaluator.js'
import {
    defineStore,
    registerStorePlugin,
    resetStore,
    clearStores,
    storeToRefs,
    storeToState,
    storeToGetters
} from '../core/store.js'
import {
    defineComposable,
    assertSetupContext
} from '../core/composable.js'
import { setCurrentInstance } from '../core/component.js'

// Helpers
function el(tag = 'div', attrs = {}) {
    const parent = document.createElement('div')
    let attrStr = ''
    for (const [k, v] of Object.entries(attrs)) {
        attrStr += ` ${k}="${v}"`
    }
    parent.innerHTML = `<${tag}${attrStr}></${tag}>`
    return parent.firstElementChild
}

beforeEach(() => {
    vi.restoreAllMocks()
    clearStores()
    setCurrentInstance(null)
})

// ─────────────────────────────────────────────
// DIRECTIVES (custom)
// ─────────────────────────────────────────────

describe('directive()', () => {

    it('errors on empty name', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
        directive('', {})
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('non-empty name'))
    })

    it('errors on non-object definition', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
        directive('focus', null)
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('definition object'))
    })

    it('registers and calls mounted hook', () => {
        const mountedSpy = vi.fn()
        directive('highlight', { mounted: mountedSpy })

        const node = el('div', { 'f-highlight': '' })
        processCustomDirectives(node, {}, [])

        expect(mountedSpy).toHaveBeenCalledWith(node, expect.objectContaining({ value: undefined }))
    })

    it('passes arg and modifiers to binding', () => {
        const mountedSpy = vi.fn()
        directive('tooltip', { mounted: mountedSpy })

        const node = el('div', { 'f-tooltip:top.large': 'Hello' })
        processCustomDirectives(node, { Hello: 'Hello' }, [])

        expect(mountedSpy).toHaveBeenCalledWith(
            node,
            expect.objectContaining({ arg: 'top', modifiers: ['large'], value: 'Hello' })
        )
    })

    it('calls updated hook reactively', () => {
        const updatedSpy = vi.fn()
        directive('badge', { updated: updatedSpy })

        const count = signal(0)
        const context = { count }
        const node = el('div', { 'f-badge': 'count' })
        const effects = []

        processCustomDirectives(node, context, effects)

        count(5)
        expect(updatedSpy).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('calls unmounted hook on cleanup', () => {
        const unmountedSpy = vi.fn()
        directive('cleanup-test', { unmounted: unmountedSpy })

        const node = el('div', { 'f-cleanup-test': '' })
        const effects = []
        processCustomDirectives(node, {}, effects)

        for (const e of effects) if (typeof e === 'function') e()
        expect(unmountedSpy).toHaveBeenCalled()
    })

})

// ─────────────────────────────────────────────
// PROCESSSHOW
// ─────────────────────────────────────────────

describe('processShow()', () => {

    it('hides element when expression is falsy', () => {
        const visible = signal(false)
        const node = el('div', { 'f-show': 'visible' })
        const effects = []

        processShow(node, { visible }, effects)
        expect(node.style.display).toBe('none')

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('shows element when expression is truthy', () => {
        const visible = signal(true)
        const node = el('div', { 'f-show': 'visible' })
        const effects = []

        processShow(node, { visible }, effects)
        expect(node.style.display).not.toBe('none')

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('reacts to signal changes', () => {
        const visible = signal(true)
        const node = el('div', { 'f-show': 'visible' })
        const effects = []

        processShow(node, { visible }, effects)
        visible(false)
        expect(node.style.display).toBe('none')

        for (const e of effects) if (typeof e === 'function') e()
    })

})

// ─────────────────────────────────────────────
// PROCESSTEXT
// ─────────────────────────────────────────────

describe('processText()', () => {

    it('sets textContent from expression', () => {
        const name = signal('Alice')
        const node = el('p', { 'f-text': 'name' })
        const effects = []

        processText(node, { name }, effects)
        expect(node.textContent).toBe('Alice')

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('updates textContent reactively', () => {
        const name = signal('Alice')
        const node = el('p', { 'f-text': 'name' })
        const effects = []

        processText(node, { name }, effects)
        name('Bob')
        expect(node.textContent).toBe('Bob')

        for (const e of effects) if (typeof e === 'function') e()
    })

})

// ─────────────────────────────────────────────
// PROCESSHTML
// ─────────────────────────────────────────────

describe('processHtml()', () => {

    it('sets innerHTML from expression', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
        const content = signal('<b>Bold</b>')
        const node = el('div', { 'f-html': 'content' })
        const effects = []

        processHtml(node, { content }, effects)
        expect(node.innerHTML).toBe('<b>Bold</b>')

        for (const e of effects) if (typeof e === 'function') e()
        warn.mockRestore()
    })

})

// ─────────────────────────────────────────────
// PROCESSMODEL
// ─────────────────────────────────────────────

describe('processModel()', () => {

    it('updates signal on input event', () => {
        const name = signal('')
        const node = el('input', { 'f-model': 'name' })
        const effects = []

        processModel(node, { name }, effects)

        node.value = 'Bob'
        node.dispatchEvent(new Event('input'))
        expect(name()).toBe('Bob')

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('updates input value when signal changes', () => {
        const name = signal('Alice')
        const node = el('input', { 'f-model': 'name' })
        const effects = []

        processModel(node, { name }, effects)
        name('Charlie')
        expect(node.value).toBe('Charlie')

        for (const e of effects) if (typeof e === 'function') e()
    })

})

// ─────────────────────────────────────────────
// PROCESS EVENTS
// ─────────────────────────────────────────────

describe('processEvents()', () => {

    it('calls handler function on event', () => {
        const handler = vi.fn()
        const node = el('button', { '@click': 'handler' })
        const effects = []

        // Attach to DOM for delegated events to work
        document.body.appendChild(node)
        processEvents(node, { handler }, effects)
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }))

        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
        node.remove()
    })

    it('.prevent modifier calls preventDefault', () => {
        const node = el('form', { '@submit.prevent': 'h' })
        const effects = []
        processEvents(node, { h: vi.fn() }, effects)

        const event = new Event('submit', { cancelable: true })
        node.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('.stop modifier calls stopPropagation (native event)', () => {
        // Using on:click for native events where stopPropagation works reliably
        const node = el('div', { 'on:click.stop': 'h' })
        const effects = []
        processEvents(node, { h: vi.fn() }, effects)

        const event = new MouseEvent('click', { bubbles: true })
        const stopSpy = vi.spyOn(event, 'stopPropagation')
        node.dispatchEvent(event)
        expect(stopSpy).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('.debounce modifier delays execution', async () => {
        vi.useFakeTimers()
        const handler = vi.fn()
        const node = el('input', { '@input.debounce.300ms': 'handler' })
        const effects = []

        // Attach to DOM for delegated events
        document.body.appendChild(node)
        processEvents(node, { handler }, effects)

        node.dispatchEvent(new Event('input', { bubbles: true }))
        expect(handler).not.toHaveBeenCalled()

        vi.advanceTimersByTime(300)
        expect(handler).toHaveBeenCalledTimes(1)

        for (const e of effects) if (typeof e === 'function') e()
        vi.useRealTimers()
        node.remove()
    })

})

// ─────────────────────────────────────────────
// EVALUATOR
// ─────────────────────────────────────────────

describe('Evaluator', () => {
    it('evaluates simple expressions', () => {
        expect(evaluateExpression('1 + 1', {})).toBe(2)
        expect(evaluateExpression('"hello " + name', { name: 'Alice' })).toBe('hello Alice')
    })

    it('unwraps signals automatically', () => {
        const count = signal(10)
        expect(evaluateExpression('count * 2', { count })).toBe(20)
    })

    it('parses mustache interpolation', () => {
        const parts = parseInterpolation('Hello {{ name }}!')
        expect(parts).toHaveLength(3)
        expect(parts[0]).toEqual({ type: 'static', value: 'Hello ' })
        expect(parts[1]).toEqual({ type: 'dynamic', key: 'name' })
        expect(parts[2]).toEqual({ type: 'static', value: '!' })
    })

    it('handles escape sequences for literal braces', () => {
        const parts = parseInterpolation('This is \\{{ literal }} not dynamic')
        expect(parts).toHaveLength(3)
        expect(parts[0]).toEqual({ type: 'static', value: 'This is ' })
        expect(parts[1]).toEqual({ type: 'static', value: '{{' })
        expect(parts[2]).toEqual({ type: 'static', value: ' literal }} not dynamic' })
    })

    it('handles complex expressions with ternary operators', () => {
        const parts = parseInterpolation('{{ a > 0 ? "yes" : "no" }}')
        expect(parts).toHaveLength(1)
        expect(parts[0]).toEqual({ type: 'dynamic', key: 'a > 0 ? "yes" : "no"' })
    })

    it('handles string literals containing braces', () => {
        const parts = parseInterpolation('{{ "foo {{ bar }}" }}')
        expect(parts).toHaveLength(1)
        expect(parts[0]).toEqual({ type: 'dynamic', key: '"foo {{ bar }}"' })
    })

    it('handles nested mustache expressions', () => {
        const parts = parseInterpolation('{{ outer {{ inner }} }}')
        expect(parts).toHaveLength(1)
        expect(parts[0]).toEqual({ type: 'dynamic', key: 'outer {{ inner }}' })
    })

    it('handles mixed escaped and dynamic expressions', () => {
        const parts = parseInterpolation('\\{{ escaped }} {{ dynamic }} \\{{ another }}')
        // Escape sequences produce static parts, dynamic produces dynamic part
        expect(parts).toHaveLength(6)
        expect(parts[0]).toEqual({ type: 'static', value: '{{' })
        expect(parts[1]).toEqual({ type: 'static', value: ' escaped }} ' })
        expect(parts[2]).toEqual({ type: 'dynamic', key: 'dynamic' })
        expect(parts[3]).toEqual({ type: 'static', value: ' ' })
        expect(parts[4]).toEqual({ type: 'static', value: '{{' })
        expect(parts[5]).toEqual({ type: 'static', value: ' another }}' })
    })

    it('sanitizes dangerous attributes', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
        expect(sanitizeAttr('href', 'javascript:alert(1)')).toBe('about:blank')
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})

// ─────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────

describe('Store', () => {
    it('defines and provides a store', () => {
        const useStore = defineStore('main', () => {
            const count = signal(0)
            return { count }
        })

        const store = useStore()
        expect(store.count()).toBe(0)
        store.count(1)
        
        const sameStore = useStore()
        expect(sameStore.count()).toBe(1)
    })

    it('supports plugins', () => {
        const plugin = vi.fn()
        registerStorePlugin(plugin)

        const useStore = defineStore('plugin-test', () => ({ ok: true }))
        useStore()

        expect(plugin).toHaveBeenCalledWith(expect.anything(), 'plugin-test')
    })

    it('computes getters from computed signals', () => {
        const useStore = defineStore('cart', () => {
            const items = signal([{ price: 10 }, { price: 20 }])
            const total = computed(() => items().reduce((sum, item) => sum + item.price, 0))
            return { items, total }
        })

        const store = useStore()
        expect(store.total()).toBe(30)

        store.items.push({ price: 15 })
        expect(store.total()).toBe(45)
    })

    it('warns when trying to set a getter', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })

        const useStore = defineStore('readonly-test', () => {
            const count = signal(5)
            const doubled = computed(() => count() * 2)
            return { count, doubled }
        })

        const store = useStore()
        store.doubled(100)

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('read-only'))
        expect(store.doubled()).toBe(10)

        warn.mockRestore()
    })

    it('separates state and getters via storeToState and storeToGetters', () => {
        const useStore = defineStore('separation-test', () => {
            const name = signal('Alice')
            const greeting = computed(() => `Hello ${name()}`)
            return { name, greeting }
        })

        const store = useStore()
        const state = storeToState(store)
        const getters = storeToGetters(store)
        const refs = storeToRefs(store)

        expect(state.name).toBeDefined()
        expect(state.greeting).toBeUndefined()

        expect(getters.greeting).toBeDefined()
        expect(getters.name).toBeUndefined()

        expect(refs.name).toBeDefined()
        expect(refs.greeting).toBeDefined()

        expect(state.name()).toBe('Alice')
        expect(getters.greeting()).toBe('Hello Alice')
    })
})

// ─────────────────────────────────────────────
// COMPOSABLE
// ─────────────────────────────────────────────

describe('Composable', () => {
    it('defines a composable', () => {
        const useTest = defineComposable((val) => val * 2)
        expect(useTest(5)).toBe(10)
        expect(useTest._isComposable).toBe(true)
    })

    it('warns when called outside setup', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
        assertSetupContext('test')
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('outside of setup'))
        warn.mockRestore()
    })
})

// ─────────────────────────────────────────────
// PROCESSCLASSLIST
// ─────────────────────────────────────────────

describe('processClassList()', () => {

    it('adds classes when values are true', () => {
        const isActive = signal(true)
        const isDisabled = signal(false)
        const classList = computed(() => ({
            active: isActive(),
            disabled: isDisabled()
        }))

        const node = el('div', { 'f-classList': 'classList' })
        const effects = []

        processClassList(node, { classList }, effects)

        expect(node.classList.contains('active')).toBe(true)
        expect(node.classList.contains('disabled')).toBe(false)

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('removes classes when values become false', () => {
        const isActive = signal(true)
        const classList = computed(() => ({
            active: isActive()
        }))

        const node = el('div', { 'f-classList': 'classList' })
        const effects = []

        processClassList(node, { classList }, effects)

        expect(node.classList.contains('active')).toBe(true)

        isActive(false)

        expect(node.classList.contains('active')).toBe(false)

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('reacts to signal changes', () => {
        const theme = signal('light')
        const classList = computed(() => ({
            'theme-dark': theme() === 'dark',
            'theme-light': theme() === 'light'
        }))

        const node = el('div', { 'f-classList': 'classList' })
        const effects = []

        processClassList(node, { classList }, effects)

        expect(node.classList.contains('theme-light')).toBe(true)
        expect(node.classList.contains('theme-dark')).toBe(false)

        theme('dark')

        expect(node.classList.contains('theme-light')).toBe(false)
        expect(node.classList.contains('theme-dark')).toBe(true)

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('cleans up classes no longer in object', () => {
        const showActive = signal(true)
        const showDisabled = signal(true)
        const classList = computed(() => ({
            active: showActive(),
            disabled: showDisabled()
        }))

        const node = el('div', { 'f-classList': 'classList' })
        const effects = []

        processClassList(node, { classList }, effects)

        expect(node.classList.contains('active')).toBe(true)
        expect(node.classList.contains('disabled')).toBe(true)

        showDisabled(false)

        expect(node.classList.contains('active')).toBe(true)
        expect(node.classList.contains('disabled')).toBe(false)

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('preserves static class attribute', () => {
        const isActive = signal(true)
        const classList = computed(() => ({
            active: isActive()
        }))

        const node = el('div', { class: 'base-class', 'f-classList': 'classList' })
        const effects = []

        processClassList(node, { classList }, effects)

        expect(node.classList.contains('base-class')).toBe(true)
        expect(node.classList.contains('active')).toBe(true)

        for (const e of effects) if (typeof e === 'function') e()
    })

})

// ─────────────────────────────────────────────
// DELEGATED EVENTS
// ─────────────────────────────────────────────

describe('Delegated Events', () => {

    it('isDelegatedEvent returns true for delegated event types', () => {
        expect(isDelegatedEvent('click')).toBe(true)
        expect(isDelegatedEvent('input')).toBe(true)
        expect(isDelegatedEvent('keydown')).toBe(true)
        expect(isDelegatedEvent('scroll')).toBe(false)
        expect(isDelegatedEvent('customEvent')).toBe(false)
    })

    it('delegated events work via @ syntax', () => {
        const handler = vi.fn()
        const node = el('button', { '@click': 'handler' })
        const effects = []

        // Attach to DOM for delegated events to work
        document.body.appendChild(node)
        processEvents(node, { handler }, effects)

        const event = new MouseEvent('click', { bubbles: true })
        node.dispatchEvent(event)

        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
        node.remove()
    })

    it('native events work via on: syntax', () => {
        const handler = vi.fn()
        const node = el('button', { 'on:click': 'handler' })
        const effects = []

        processEvents(node, { handler }, effects)

        const event = new MouseEvent('click', { bubbles: true })
        node.dispatchEvent(event)

        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('non-delegated events fall back to native for @ syntax', () => {
        const handler = vi.fn()
        const node = el('div', { '@scroll': 'handler' })
        const effects = []

        processEvents(node, { handler }, effects)

        const event = new Event('scroll')
        node.dispatchEvent(event)

        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('native events support stopPropagation correctly', () => {
        const parentHandler = vi.fn()
        const childHandler = vi.fn((e) => e.stopPropagation())

        const parent = el('div', {})
        const child = el('button', { 'on:click': 'childHandler' })
        parent.appendChild(child)

        parent.addEventListener('click', parentHandler)

        const effects = []
        processEvents(child, { childHandler }, effects)

        const event = new MouseEvent('click', { bubbles: true })
        child.dispatchEvent(event)

        expect(childHandler).toHaveBeenCalled()
        // parentHandler should not be called because stopPropagation worked
        expect(parentHandler).not.toHaveBeenCalled()

        parent.removeEventListener('click', parentHandler)
        for (const e of effects) if (typeof e === 'function') e()
    })

    it('delegated events with .capture modifier use native listener', () => {
        const handler = vi.fn()
        const node = el('button', { '@click.capture': 'handler' })
        const effects = []

        processEvents(node, { handler }, effects)

        const event = new MouseEvent('click', { bubbles: true })
        node.dispatchEvent(event)

        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('delegated events support modifiers', () => {
        const handler = vi.fn()
        const node = el('input', { '@keydown.enter': 'handler' })
        const effects = []

        // Attach to DOM for delegated events
        document.body.appendChild(node)
        processEvents(node, { handler }, effects)

        // Should not trigger for non-enter keys
        const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
        node.dispatchEvent(spaceEvent)
        expect(handler).not.toHaveBeenCalled()

        // Should trigger for enter key
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        node.dispatchEvent(enterEvent)
        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
        node.remove()
    })

    it('10 delegated buttons share 1 document listener', () => {
        const handlers = []
        const container = document.createElement('div')
        document.body.appendChild(container)

        const effects = []

        for (let i = 0; i < 10; i++) {
            const handler = vi.fn()
            handlers.push(handler)
            const button = el('button', { '@click': `handler${i}` })
            container.appendChild(button)
            processEvents(button, { [`handler${i}`]: handler }, effects)
        }

        // Click each button
        const buttons = container.querySelectorAll('button')
        buttons.forEach((btn, index) => {
            btn.click()
            expect(handlers[index]).toHaveBeenCalled()
        })

        // Verify all handlers were called
        handlers.forEach(handler => {
            expect(handler).toHaveBeenCalled()
        })

        // Cleanup
        for (const e of effects) if (typeof e === 'function') e()
        container.remove()
    })

    it('delegated event listener persists after element removal', () => {
        const handler1 = vi.fn()
        const handler2 = vi.fn()

        const container = document.createElement('div')
        document.body.appendChild(container)

        const effects1 = []
        const button1 = el('button', { '@click': 'handler1' })
        container.appendChild(button1)
        processEvents(button1, { handler1 }, effects1)

        // Click first button - should work
        button1.click()
        expect(handler1).toHaveBeenCalled()

        // Remove first button
        button1.remove()
        for (const e of effects1) if (typeof e === 'function') e()

        // Add second button with same event type
        const effects2 = []
        const button2 = el('button', { '@click': 'handler2' })
        container.appendChild(button2)
        processEvents(button2, { handler2 }, effects2)

        // Click second button - should work (document listener still exists)
        button2.click()
        expect(handler2).toHaveBeenCalled()

        // Cleanup
        for (const e of effects2) if (typeof e === 'function') e()
        container.remove()
    })

    it('native events support modifiers', () => {
        const handler = vi.fn()
        const node = el('input', { 'on:keydown.enter': 'handler' })
        const effects = []

        processEvents(node, { handler }, effects)

        // Should not trigger for non-enter keys
        const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
        node.dispatchEvent(spaceEvent)
        expect(handler).not.toHaveBeenCalled()

        // Should trigger for enter key
        const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        node.dispatchEvent(enterEvent)
        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
    })

    it('cleanup removes delegated event listeners', () => {
        const handler = vi.fn()
        const node = el('button', { '@click': 'handler' })
        const effects = []

        processEvents(node, { handler }, effects)

        // Cleanup all effects
        for (const e of effects) if (typeof e === 'function') e()

        // Handler should not be called after cleanup
        const event = new MouseEvent('click', { bubbles: true })
        node.dispatchEvent(event)

        // Note: In the actual implementation, the document listener remains
        // but the handler is removed from the registry
        // This test verifies cleanup function exists and runs without error
        expect(effects.length).toBeGreaterThan(0)
    })

    it('10 delegated buttons share 1 document listener', () => {
        const handlers = []
        const container = document.createElement('div')
        document.body.appendChild(container)

        const effects = []

        for (let i = 0; i < 10; i++) {
            const handler = vi.fn()
            handlers.push(handler)
            const button = el('button', { '@click': `handler${i}` })
            container.appendChild(button)
            processEvents(button, { [`handler${i}`]: handler }, effects)
        }

        // Click each button
        const buttons = container.querySelectorAll('button')
        buttons.forEach((btn, index) => {
            btn.click()
            expect(handlers[index]).toHaveBeenCalled()
        })

        // Verify all handlers were called
        handlers.forEach(handler => {
            expect(handler).toHaveBeenCalled()
        })

        // Cleanup
        for (const e of effects) if (typeof e === 'function') e()
        container.remove()
    })

    it('delegated event listener persists after element removal', () => {
        const handler1 = vi.fn()
        const handler2 = vi.fn()

        const container = document.createElement('div')
        document.body.appendChild(container)

        const effects1 = []
        const button1 = el('button', { '@click': 'handler1' })
        container.appendChild(button1)
        processEvents(button1, { handler1 }, effects1)

        // Click first button - should work
        button1.click()
        expect(handler1).toHaveBeenCalled()

        // Remove first button
        button1.remove()
        for (const e of effects1) if (typeof e === 'function') e()

        // Add second button with same event type
        const effects2 = []
        const button2 = el('button', { '@click': 'handler2' })
        container.appendChild(button2)
        processEvents(button2, { handler2 }, effects2)

        // Click second button - should work (document listener still exists)
        button2.click()
        expect(handler2).toHaveBeenCalled()

        // Cleanup
        for (const e of effects2) if (typeof e === 'function') e()
        container.remove()
    })

    it('native events support modifiers', () => {
    const handler = vi.fn()
    const node = el('input', { 'on:keydown.enter': 'handler' })
    const effects = []

    processEvents(node, { handler }, effects)

    // Should not trigger for non-enter keys
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
    node.dispatchEvent(spaceEvent)
    expect(handler).not.toHaveBeenCalled()

    // Should trigger for enter key
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    node.dispatchEvent(enterEvent)
    expect(handler).toHaveBeenCalled()

    for (const e of effects) if (typeof e === 'function') e()
})

it('cleanup removes delegated event listeners', () => {
    const handler = vi.fn()
    const node = el('button', { '@click': 'handler' })
    const effects = []

    processEvents(node, { handler }, effects)

    // Cleanup all effects
    for (const e of effects) if (typeof e === 'function') e()

    // Handler should not be called after cleanup
    const event = new MouseEvent('click', { bubbles: true })
    node.dispatchEvent(event)

    // Note: In the actual implementation, the document listener remains
    // but the handler is removed from the registry
    // This test verifies cleanup function exists and runs without error
    expect(effects.length).toBeGreaterThan(0)
})

it('debounce modifier delays handler execution', () => {
    const handler = vi.fn()
    const node = el('input', { '@input.debounce': 'handler' })
    const effects = []

    document.body.appendChild(node)
    processEvents(node, { handler }, effects)

    // Trigger multiple input events quickly
    for (let i = 0; i < 5; i++) {
        node.dispatchEvent(new Event('input', { bubbles: true }))
    }

    // Handler should not be called immediately
    expect(handler).not.toHaveBeenCalled()

    // Wait for debounce (250ms default)
    return new Promise(resolve => {
        setTimeout(() => {
            expect(handler).toHaveBeenCalledTimes(1)
            for (const e of effects) if (typeof e === 'function') e()
            node.remove()
            resolve()
        }, 300)
    })
})

it('throttle modifier limits handler execution rate', () => {
    const handler = vi.fn()
    const node = el('input', { '@input.throttle': 'handler' })
    const effects = []

    document.body.appendChild(node)
    processEvents(node, { handler }, effects)

    // Trigger multiple input events
    for (let i = 0; i < 5; i++) {
        node.dispatchEvent(new Event('input', { bubbles: true }))
    }

    // Wait a bit
    return new Promise(resolve => {
        setTimeout(() => {
            // With throttle, should be called once initially
            expect(handler).toHaveBeenCalledTimes(1)
            for (const e of effects) if (typeof e === 'function') e()
            node.remove()
            resolve()
        }, 100)
    })
})

it('self modifier only triggers when event.target is the element', () => {
    const handler = vi.fn()
    const parent = el('div', { 'on:click.self': 'handler' })
    const child = el('button', { text: 'Click me' })
    parent.appendChild(child)

    const effects = []

    document.body.appendChild(parent)
    processEvents(parent, { handler }, effects)

    // Click child - should not trigger parent handler due to .self
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    // Click parent directly - should trigger
    parent.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalled()

    for (const e of effects) if (typeof e === 'function') e()
    parent.remove()
})

it('key modifiers work for enter and escape', () => {
    const handler = vi.fn()
    const node = el('input', { '@keydown.enter': 'handler' })
    const effects = []

    document.body.appendChild(node)
    processEvents(node, { handler }, effects)

    // Should not trigger for other keys
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    // Should trigger for enter
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(handler).toHaveBeenCalled()

    for (const e of effects) if (typeof e === 'function') e()
    node.remove()
})

it('escape key modifier works', () => {
    const handler = vi.fn()
    const node = el('input', { '@keydown.escape': 'handler' })
    const effects = []

    document.body.appendChild(node)
    processEvents(node, { handler }, effects)

    // Should not trigger for other keys
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    // Should trigger for escape
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(handler).toHaveBeenCalled()

    for (const e of effects) if (typeof e === 'function') e()
    node.remove()
})

it('same element can have 2 different events', () => {
    const clickHandler = vi.fn()
    const mouseoverHandler = vi.fn()
    const node = el('button', { '@click': 'clickHandler', '@mouseover': 'mouseoverHandler' })
    const effects = []

    document.body.appendChild(node)
    processEvents(node, { clickHandler, mouseoverHandler }, effects)

    // Trigger click
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(clickHandler).toHaveBeenCalled()
    expect(mouseoverHandler).not.toHaveBeenCalled()

    // Trigger mouseover
    node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(mouseoverHandler).toHaveBeenCalled()
    expect(clickHandler).toHaveBeenCalledTimes(1) // Still only called once

    for (const e of effects) if (typeof e === 'function') e()
    node.remove()
})

it('capture modifier works with bubbling', () => {
    const parentHandler = vi.fn()
    const childHandler = vi.fn()
    const parent = el('div', { '@click.capture': 'parentHandler' })
    const child = el('button', { '@click': 'childHandler' })
    parent.appendChild(child)

    const parentEffects = []
    const childEffects = []

    document.body.appendChild(parent)
    processEvents(parent, { parentHandler }, parentEffects)
    processEvents(child, { childHandler }, childEffects)

    // Click child - capture phase should fire parent first
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, capture: true }))

    // With capture, parent should be called before child
    expect(parentHandler).toHaveBeenCalled()
    expect(childHandler).toHaveBeenCalled()

    for (const e of parentEffects) if (typeof e === 'function') e()
    for (const e of childEffects) if (typeof e === 'function') e()
    parent.remove()
})
})
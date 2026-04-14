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
    clearStores
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

        processEvents(node, { handler }, effects)
        node.dispatchEvent(new MouseEvent('click'))

        expect(handler).toHaveBeenCalled()

        for (const e of effects) if (typeof e === 'function') e()
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

    it('.stop modifier calls stopPropagation', () => {
        const node = el('div', { '@click.stop': 'h' })
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

        processEvents(node, { handler }, effects)

        node.dispatchEvent(new Event('input'))
        expect(handler).not.toHaveBeenCalled()
        
        vi.advanceTimersByTime(300)
        expect(handler).toHaveBeenCalledTimes(1)

        for (const e of effects) if (typeof e === 'function') e()
        vi.useRealTimers()
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
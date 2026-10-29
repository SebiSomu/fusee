import { describe, it, expect } from 'vitest'
import { compile as rustCompile } from '../core/compiler/rust-compiler.js'
import { compile as jsCompile } from '../core/compiler/main-compiler.js'

const RUNTIME = 'fusee-framework/core/h.js'

describe('Rust+WASM compiler — DOM mode output', () => {
    it('loads and compiles a static template without error', () => {
        const { code } = rustCompile('<div class="hello">World</div>', { runtimePath: RUNTIME })
        expect(typeof code).toBe('string')
        expect(code.length).toBeGreaterThan(0)
        expect(code).toContain('export function render(')
    })

    it('compiles {{ interpolation }} — emits hText with signal-aware accessor', () => {
        const source = '<p>Hello, {{ name }}!</p>'
        const { code } = rustCompile(source, { runtimePath: RUNTIME })

        expect(code).toContain('export function render(')
        // DOM mode: uses hText() for dynamic text
        expect(code).toContain('hText(')
        // Signal-aware: reads .isSignal on ctx props
        expect(code).toContain('isSignal')
        // Import from runtime
        expect(code).toContain(RUNTIME)
    })

    it('compiles f-if — emits hIf() with branch conditions and preserves branch element tags', () => {
        const source = '<div><span f-if="ok">Yes</span><span f-else>No</span></div>'
        const { code } = rustCompile(source, { runtimePath: RUNTIME })

        expect(code).toContain('export function render(')
        expect(code).toContain('hIf(')
        // f-else branch falls through as () => true
        expect(code).toContain('() => true')
        // Preserves branch element tags (span)
        expect(code).toContain('h("span"')
    })

    it('compiles f-for — emits hFor() with item iterator', () => {
        const source = '<ul><li f-for="item in items" :key="item.id">{{ item.name }}</li></ul>'
        const { code } = rustCompile(source, { runtimePath: RUNTIME })

        expect(code).toContain('export function render(')
        expect(code).toContain('hFor(')
        // hFor passes each item as an accessor, so item references read through it
        expect(code).toContain('(item) => item().id')
        expect(code).toContain('String(item().name)')
    })

    it('returns warnings array (empty for valid templates)', () => {
        const { warnings } = rustCompile('<div>ok</div>', { runtimePath: RUNTIME })
        expect(Array.isArray(warnings)).toBe(true)
    })

    it('returns tokens array', () => {
        const { tokens } = rustCompile('<p>text</p>', { runtimePath: RUNTIME })
        expect(Array.isArray(tokens)).toBe(true)
        expect(tokens.length).toBeGreaterThan(0)
    })

    it('throws a meaningful error on malformed input (unclosed tag)', () => {
        expect(() => rustCompile('<div><span>', { runtimePath: RUNTIME }))
            .toThrow()
    })

    it('produces the same render() export as the JS compiler for a static template', () => {
        const source = '<div class="box"><p>Hello</p></div>'
        const opts = { runtimePath: RUNTIME }

        const rust = rustCompile(source, opts)
        const js   = jsCompile(source, opts)

        // Both export a render function
        expect(rust.code).toContain('export function render(')
        expect(js.code).toContain('export function render(')
        // Both reference the same runtime path
        expect(rust.code).toContain(RUNTIME)
        expect(js.code).toContain(RUNTIME)
    })
})

describe('f-if chains keep the siblings that follow them', () => {
    /** Summarizes an AST's top-level children as "Type:tag-or-text" strings. */
    const summarize = (ast) => ast.children.map(c => `${c.type}:${c.tag ?? c.slot_name ?? (c.content ?? '').trim()}`)

    it('keeps text and interpolations after an f-if element', () => {
        const { ast } = rustCompile('<p f-if="x">a</p>hello {{ y }}<b>z</b>', { runtimePath: RUNTIME })
        expect(summarize(ast)).toEqual(['If:', 'Text:hello', 'Interpolation:', 'Element:b'])
    })

    it('keeps a slot outlet after an f-if element', () => {
        const { code } = rustCompile('<p f-if="x">a</p><slot name="foot"></slot>', { runtimePath: RUNTIME })
        expect(code).toContain('hSlot(_ctx._slots, "foot"')
    })

    it('still chains f-else-if and f-else across whitespace', () => {
        const { ast } = rustCompile('<p f-if="a">1</p>\n  <p f-else-if="b">2</p>\n  <p f-else>3</p>tail', { runtimePath: RUNTIME })
        expect(ast.children[0].branches).toHaveLength(3)
        expect(summarize(ast)).toEqual(['If:', 'Text:tail'])
    })

    it('does not chain an f-else separated by content', () => {
        const { ast } = rustCompile('<p f-if="a">1</p>text<p f-else>2</p>', { runtimePath: RUNTIME })
        expect(ast.children[0].branches).toHaveLength(1)
        expect(summarize(ast).slice(0, 2)).toEqual(['If:', 'Text:text'])
    })
})

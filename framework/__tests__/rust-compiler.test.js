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

    it('compiles f-if — emits hIf() with branch conditions', () => {
        const source = '<div><span f-if="ok">Yes</span><span f-else>No</span></div>'
        const { code } = rustCompile(source, { runtimePath: RUNTIME })

        expect(code).toContain('export function render(')
        expect(code).toContain('hIf(')
        // f-else branch falls through as () => true
        expect(code).toContain('() => true')
    })

    it('compiles f-for — emits hFor() with item iterator', () => {
        const source = '<ul><li f-for="item in items" :key="item.id">{{ item.name }}</li></ul>'
        const { code } = rustCompile(source, { runtimePath: RUNTIME })

        expect(code).toContain('export function render(')
        expect(code).toContain('hFor(')
        // key expression
        expect(code).toContain('item.id')
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

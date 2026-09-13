import { describe, it, expect } from 'vitest'
import { compile as legacyCompile } from '../core/compiler-legacy/main-compiler.js'

const RUNTIME = 'fusee-framework/core/h.js'

describe('JS legacy compiler / generator.js', () => {
    it('compiles f-if — emits hIf() and preserves the branch elements own tags', () => {
        const source = '<div><span f-if="ok">Yes</span><span f-else>No</span></div>'
        const { code } = legacyCompile(source, { runtimePath: RUNTIME })

        expect(code).toContain('export function render(')
        expect(code).toContain('hIf(')
        expect(code).toContain('() => true')
        // Preserves the branch element (span)
        expect(code).toContain('h("span"')
    })
})

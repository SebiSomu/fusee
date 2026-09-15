import { compile } from '../main-compiler.js'
import fs from 'node:fs'
import path from 'node:path'

const IMPORT_RE = /^import\s+(?:\{[^}]*\}|[\w$]+)\s+from\s+['"]([^'"]+\.template\.html)['"]\s*;?/gm

export function fuseeCompilerPlugin() {
    return {
        name: 'vite-plugin-fusee-compiler',
        enforce: 'pre',

        async transform(code, id, ssrOptions) {
            if (!id.endsWith('.js') && !id.endsWith('.ts'))
                return null
            if (!IMPORT_RE.test(code))
                return null

            IMPORT_RE.lastIndex = 0

            const isSSR = typeof ssrOptions === 'boolean' ? ssrOptions : Boolean(ssrOptions?.ssr)
            let result = code
            let match

            while ((match = IMPORT_RE.exec(code)) !== null) {
                const [fullImport, templatePath] = match
                const absPath = path.resolve(path.dirname(id), templatePath)
                const source = fs.readFileSync(absPath, 'utf-8')
                const { code: compiledCode, ssrCode } = compile(source, {
                    target: isSSR ? 'ssr' : 'both',
                    runtimePath: 'fusee-framework/core/h.js',
                    ssrRuntimePath: 'fusee-framework/core/ssr.js'
                })

                const codeToUse = (isSSR ? ssrCode : compiledCode) ?? compiledCode
                const namedMatch = fullImport.match(/\{\s*(?:render|renderSSR)\s+as\s+([\w$]+)\s*\}/)
                const defaultMatch = fullImport.match(/import\s+([\w$]+)\s+from/)
                const localName = namedMatch ? namedMatch[1] : (defaultMatch ? defaultMatch[1] : (isSSR ? 'renderSSR' : 'render'))

                const fnHeader = isSSR ? 'export function renderSSR(' : 'export function render('
                const inlined = codeToUse.replace(
                    fnHeader,
                    `function ${localName}(`
                )

                result = result.replace(fullImport, inlined)
            }

            return { code: result, map: null }
        }
    }
}

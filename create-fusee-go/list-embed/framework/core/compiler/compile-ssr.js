import { tokenize } from './lexer.js'
import { parse } from './parser.js'
import { transform } from './transformer.js'
import { generateSSR } from './ssr-generator.js'

export function compileSSR(source, options = {}) {
    const components = new Set(options.components ?? [])
    const tokens = tokenize(source)
    const parsedAst = parse(tokens, source, components)
    const { ast, warnings } = transform(parsedAst, {
        components,
        source,
        scope: options.scope
    })
    const code = generateSSR(ast, {
        source,
        runtimePath: options.runtimePath
    })
    return { code, warnings, ast }
}
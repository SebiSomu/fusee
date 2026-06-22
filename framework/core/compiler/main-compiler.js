import { tokenize } from './lexer.js'
import { parse } from './parser.js'
import { transform } from './transformer.js'
import { generate } from './generator.js'
import { CompileError, ErrorCollector } from './errors.js'

export function compile(source, options = {}) {
    const filename = options.filename ?? '<template>'
    const components = new Set(options.components ?? [])
    const collector = new ErrorCollector(source)

    let tokens
    try {
        tokens = tokenize(source)
    } catch (err) {
        _rethrow(err, filename)
    }

    let ast
    try {
        ast = parse(tokens, source, components)
    } catch (err) {
        _rethrow(err, filename)
    }

    let warnings = []
    try {
        const result = transform(ast, { components, source })
        ast      = result.ast
        warnings = result.warnings
    } catch (err) {
        _rethrow(err, filename)
    }

    if (options.throwOnWarning && warnings.length > 0) {
        const w = warnings[0]
        throw new CompileError(w.code, w.loc, source)
    }

    let code
    try {
        code = generate(ast, {
            source,
            runtimePath: options.runtimePath,
        })
    } catch (err) {
        _rethrow(err, filename)
    }

    return { code, ast, tokens, warnings }
}

export function parseOnly(source, options = {}) {
    const components = new Set(options.components ?? [])
    const tokens = tokenize(source)
    const ast = parse(tokens, source, components)
    return { ast, tokens }
}

export function transformOnly(ast, options = {}) {
    return transform(ast, {
        components: new Set(options.components ?? []),
        source: options.source ?? '',
    })
}

export function compileBatch(templates, sharedOptions = {}) {
    return templates.map(({ id, source }) => {
        try {
            const { code, warnings } = compile(source, { ...sharedOptions, filename: id })
            return { 
                id,
                code,
                warnings,
                error: null
            }
        } catch (err) {
            return { 
                id,
                code: null,
                warnings: [],
                error: err
            }
        }
    })
}

function _rethrow(err, filename) {
    if (err instanceof CompileError) {
        err.message = err.format(filename)
        throw err
    }
    throw err
}
import { compile as rustCompile } from './rust-compiler.js'
import { tokenize } from './lexer.js'
import { parse } from './parser.js'
import { transform } from './transformer.js'
import { generateSSR } from './ssr-generator.js'
import { CompileError } from './errors.js'

export function compile(source, options = {}) {
    const filename = options.filename ?? '<template>'
    const components = new Set(options.components ?? [])
    const target = options.target ?? 'client'
    let code = null
    let ssrCode = null
    let ast = null
    let tokens = null
    let warnings = []

    if (target === 'client' || target === 'both') {
        try {
            const result = rustCompile(source, {
                filename,
                runtimePath: options.runtimePath,
                components: [...components],
                scope: options.scope ? [...options.scope] : [],
                throwOnWarning: options.throwOnWarning ?? false,
            })
            code = result.code
            ast = result.ast
            tokens = result.tokens
            warnings = result.warnings ?? []
        } catch (err) {
            _rethrow(err, filename)
        }
    }

    if (target === 'ssr' || target === 'both') {
        try {
            let ssrTokens
            try {
                ssrTokens = tokenize(source)
            } catch (err) { _rethrow(err, filename) }

            let ssrAst
            try {
                ssrAst = parse(ssrTokens, source, components)
            } catch (err) { _rethrow(err, filename) }

            let ssrWarnings = []
            try {
                const result = transform(ssrAst, { components, source, scope: options.scope })
                ssrAst = result.ast
                ssrWarnings = result.warnings
            } catch (err) { _rethrow(err, filename) }

            if (options.throwOnWarning && ssrWarnings.length > 0) {
                const w = ssrWarnings[0]
                throw new CompileError(w.code, w.loc, source)
            }

            ssrCode = generateSSR(ssrAst, { source, runtimePath: options.ssrRuntimePath ?? options.runtimePath })

            if (target === 'ssr') {
                code = ssrCode
                tokens = ssrTokens
                ast = ssrAst
            }
            if (warnings.length === 0) {
                warnings = ssrWarnings
            }
        } catch (err) { _rethrow(err, filename) }
    }

    return {
        code,
        ssrCode,
        ast,
        tokens,
        warnings,
    }
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
        scope: options.scope,
    })
}

export function compileBatch(templates, sharedOptions = {}) {
    return templates.map(({ id, source }) => {
        try {
            const { code, warnings } = compile(source, { ...sharedOptions, filename: id })
            return { id, code, warnings, error: null }
        } catch (err) {
            return { id, code: null, warnings: [], error: err }
        }
    })
}

export function fuseePlugin(pluginOptions = {}) {
    return {
        name: 'vite-plugin-fusee',

        transform(src, id, ssrOptions) {
            if (!id.endsWith('.fusee') && !id.endsWith('.fhtml') && !id.endsWith('.template.html')) return null

            const isSSR = typeof ssrOptions === 'boolean' ? ssrOptions : Boolean(ssrOptions?.ssr)
            const { code, warnings } = compile(src, {
                filename: id,
                target: isSSR ? 'ssr' : 'client',
                runtimePath: pluginOptions.runtimePath,
                ssrRuntimePath: pluginOptions.ssrRuntimePath,
                components: pluginOptions.components,
                scope: pluginOptions.scope,
            })

            for (const w of warnings) {
                this.warn(typeof w.format === 'function' ? w.format(id) : String(w))
            }

            return { code, map: null }
        }
    }
}

export { fileRouterPlugin } from './plugins/file-router-plugin.js'
export { actionsPlugin } from './plugins/actions-plugin.js'
export { routerPlugin } from './plugins/router-plugin.js'
export { compileFileRoutes, generateRoutesModule, generateRouteTypes, validateRoutes as validateFileRoutes } from './plugins/file-router-plugin.js'
export { validateActions, generateClientStubs, generateServerRoutes, generateActionTypes } from './plugins/actions-plugin.js'
export { validateRoutes, generateRouterTypes } from './plugins/router-plugin.js'

function _rethrow(err, filename) {
    if (err instanceof CompileError) {
        err.message = err.format(filename)
        throw err
    }
    throw err
}

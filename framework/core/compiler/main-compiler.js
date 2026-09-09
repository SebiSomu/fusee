import { compile as rustCompile } from './rust-compiler.js'
import { tokenize } from './lexer.js'
import { parse } from './parser.js'
import { transform } from './transformer.js'
import { CompileError } from './errors.js'

export function compile(source, options = {}) {
    const filename = options.filename ?? '<template>'
    const components = new Set(options.components ?? [])
    const target = options.target ?? 'client'

    try {
        const result = rustCompile(source, {
            filename,
            runtimePath: options.runtimePath,
            ssrRuntimePath: options.ssrRuntimePath ?? options.runtimePath,
            components: [...components],
            scope: options.scope ? [...options.scope] : [],
            throwOnWarning: options.throwOnWarning ?? false,
            target,
        })
        return {
            code: result.code,
            ssrCode: result.ssrCode ?? null,
            ast: result.ast,
            tokens: result.tokens,
            warnings: result.warnings ?? [],
        }
    } catch (err) {
        _rethrow(err, filename)
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
            const { code, ssrCode, warnings } = compile(source, { ...sharedOptions, filename: id })
            return { id, code, ssrCode, warnings, error: null }
        } catch (err) {
            return { id, code: null, ssrCode: null, warnings: [], error: err }
        }
    })
}

export function fuseePlugin(pluginOptions = {}) {
    return {
        name: 'vite-plugin-fusee',

        transform(src, id, ssrOptions) {
            if (!id.endsWith('.fusee') && !id.endsWith('.fhtml') && !id.endsWith('.template.html')) return null

            const isSSR = typeof ssrOptions === 'boolean' ? ssrOptions : Boolean(ssrOptions?.ssr)
            const { code, ssrCode, warnings } = compile(src, {
                filename: id,
                target: isSSR ? 'ssr' : 'both',
                runtimePath: pluginOptions.runtimePath,
                ssrRuntimePath: pluginOptions.ssrRuntimePath,
                components: pluginOptions.components,
                scope: pluginOptions.scope,
            })

            for (const w of warnings) {
                this.warn(typeof w.format === 'function' ? w.format(id) : String(w))
            }

            const outputCode = isSSR ? (ssrCode ?? code) : code
            return { code: outputCode, map: null }
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

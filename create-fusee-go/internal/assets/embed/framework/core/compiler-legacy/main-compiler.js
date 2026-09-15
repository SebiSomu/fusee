import { tokenize }   from './lexer.js'
import { parse }      from './parser.js'
import { transform }  from './transformer.js'
import { generate }   from './generator.js'
import { CompileError, ErrorCollector } from './errors.js'
import { generateSSR } from '../ssr-module/ssr-generator.js'

export function compile(source, options = {}) {
    const filename = options.filename ?? '<template>'
    const components = new Set(options.components ?? [])
    const collector  = new ErrorCollector(source)

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
        const result = transform(ast, { components, source, scope: options.scope })
        ast = result.ast
        warnings = result.warnings
    } catch (err) {
        _rethrow(err, filename)
    }

    if (options.throwOnWarning && warnings.length > 0) {
        const w = warnings[0]
        throw new CompileError(w.code, w.loc, source)
    }

    const target = options.target ?? 'client' // 'client' | 'ssr' | 'both'
    let code = null
    let ssrCode = null

    if (target === 'client' || target === 'both') {
        try {
            code = generate(ast, { source, runtimePath: options.runtimePath })
        } catch (err) { _rethrow(err, filename) }
    }

    if (target === 'ssr' || target === 'both') {
        try {
            ssrCode = generateSSR(ast, { source, runtimePath: options.ssrRuntimePath })
        } catch (err) { _rethrow(err, filename) }
    }

    return {
        code: target === 'ssr' ? ssrCode : code,
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
                this.warn(w.format(id))
            }

            return { code, map: null }
        }
    }
}

export { fileRouterPlugin } from './plugins/file-router-plugin.js'
export { actionsPlugin } from './plugins/actions-plugin.js'
export { routerPlugin } from './plugins/router-plugin.js'
export { compileFileRoutes, generateRoutesModule, generateRouteTypes, validateRoutes as validateFileRoutes,} from './plugins/file-router-plugin.js'
export { validateActions, generateClientStubs, generateServerRoutes, generateActionTypes,} from './plugins/actions-plugin.js'
export { validateRoutes, generateRouterTypes,} from './plugins/router-plugin.js'

function _rethrow(err, filename) {
    if (err instanceof CompileError) {
        err.message = err.format(filename)
        throw err
    }
    throw err
}
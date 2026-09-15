import fs from 'node:fs'
import path from 'node:path'

const ACTION_BASE_URL = '/__fusee/actions'
const VIRTUAL_CLIENT_ID = 'virtual:fusee-actions'
const VIRTUAL_SERVER_ID = 'virtual:fusee-action-routes'

export function actionsPlugin(options = {}) {
    const {
        serverActionsFile = 'src/actions.server.js',
        clientActionsFile = 'src/actions.js',
        baseUrl = ACTION_BASE_URL,
        typesOutput = 'src/types/actions.d.ts',
    } = options

    let resolvedServerFile = null
    let resolvedClientFile = null

    return {
        name: 'vite-plugin-fusee-actions',

        configResolved(config) {
            resolvedServerFile = path.resolve(config.root, serverActionsFile)
            resolvedClientFile = path.resolve(config.root, clientActionsFile)
        },

        resolveId(id) {
            if (id === VIRTUAL_CLIENT_ID)
                return '\0' + VIRTUAL_CLIENT_ID
            if (id === VIRTUAL_SERVER_ID)
                return '\0' + VIRTUAL_SERVER_ID
        },

        async load(id) {
            if (id === '\0' + VIRTUAL_CLIENT_ID) {
                const serverActions = _extractServerActions(resolvedServerFile)
                const clientActions = resolvedClientFile ? _extractClientActions(resolvedClientFile) : []

                const { warnings, errors } = validateActions(serverActions, clientActions)
                for (const w of warnings)
                    this.warn(w)
                for (const e of errors)
                    this.error(e)

                return generateClientStubs(serverActions, { baseUrl })
            }

            if (id === '\0' + VIRTUAL_SERVER_ID) {
                const serverActions = _extractServerActions(resolvedServerFile)
                return generateServerRoutes(serverActions, { serverActionsFile, baseUrl })
            }
        },

        async buildEnd() {
            if (typesOutput && resolvedServerFile) {
                const serverActions = _extractServerActions(resolvedServerFile)
                const types = generateActionTypes(serverActions)
                const absOutput = path.resolve(process.cwd(), typesOutput)
                fs.mkdirSync(path.dirname(absOutput), { recursive: true })
                fs.writeFileSync(absOutput, types, 'utf8')
            }
        },

        handleHotUpdate({ file, server }) {
            if (file === resolvedServerFile || file === resolvedClientFile) {
                const mod = server.moduleGraph.getModuleById('\0' + VIRTUAL_CLIENT_ID)
                if (mod) 
                    server.moduleGraph.invalidateModule(mod)
                server.ws.send({ type: 'full-reload' })
            }
        },
    }
}

export function _extractServerActions(filePath) {
    if (!filePath || !fs.existsSync(filePath)) 
        return []

    const source = fs.readFileSync(filePath, 'utf8')
    const actions = []

    const RE_EXPORT = /export\s+(?:const|let|var)\s+(\w+)\s*=\s*defineAction\s*\(/g
    const RE_NAMED = /defineAction\s*\(\s*(?:async\s+)?function\s+(\w+)/g
    const RE_OPTS = /defineAction\s*\([^,)]+,\s*\{[^}]*name\s*:\s*['"](\w+)['"]/g

    const seen = new Set()

    let m
    while ((m = RE_EXPORT.exec(source)) !== null) {
        const name = m[1]
        if (!seen.has(name)) { seen.add(name); actions.push({ name, exportName: name }) }
    }

    while ((m = RE_NAMED.exec(source)) !== null) {
        const name = m[1]
        if (!seen.has(name)) { seen.add(name); actions.push({ name, exportName: name }) }
    }

    while ((m = RE_OPTS.exec(source)) !== null) {
        const name = m[1]
        if (!seen.has(name)) { seen.add(name); actions.push({ name, exportName: name }) }
    }

    return actions
}

export function _extractClientActions(filePath) {
    if (!filePath || !fs.existsSync(filePath)) 
        return []

    const source = fs.readFileSync(filePath, 'utf8')
    const names = []
    const RE = /defineAction\s*\(\s*['"](\w+)['"]/g
    let m

    while ((m = RE.exec(source)) !== null) {
        names.push(m[1])
    }

    return names
}

export function validateActions(serverActions, clientActions) {
    const warnings = []
    const errors = []

    const serverNames = new Set(serverActions.map(a => a.name))
    const clientNames = new Set(clientActions)

    for (const name of clientNames) {
        if (!serverNames.has(name)) {
            errors.push(`[fusée] Action "${name}" is defined on the client but has no corresponding defineAction() in actions.server.js`)
        }
    }

    for (const name of serverNames) {
        if (!clientNames.has(name) && clientActions.length > 0) {
            warnings.push(`[fusée] Action "${name}" is defined on the server but is not used in actions.js — it will still be accessible via HTTP POST /${name}`
            )
        }
    }

    return { warnings, errors }
}

export function generateClientStubs(actions, options = {}) {
    const { baseUrl = ACTION_BASE_URL } = options

    const lines = [
        '// [fusée] Auto-generated action stubs — do not edit',
        '// Generated by compiler/plugins/actions-plugin.js',
        '',
        `import { createActionProxy, useAction } from '../core/actions.js'`,
        '',
    ]

    for (const action of actions) {
        lines.push(`export const ${action.exportName} = createActionProxy(` +    `${JSON.stringify(action.name)}, { baseUrl: ${JSON.stringify(baseUrl)} })`)
    }

    lines.push('')
    lines.push('export { useAction }')
    lines.push('')

    return lines.join('\n')
}

export function generateServerRoutes(actions, options = {}) {
    const {
        serverActionsFile = 'src/actions.server.js',
        baseUrl = ACTION_BASE_URL,
    } = options

    const relPath = './' + serverActionsFile.replace(/^src\//, '')

    const lines = [
        '// [fusée] Auto-generated action routes — do not edit',
        '// Generated by compiler/plugins/actions-plugin.js',
        '',
        `import { handleActionRequest, getRegisteredActions } from ${JSON.stringify(relPath)}`,
        '',
        '// Import side-effect: registers all actions in the registry',
        `import ${JSON.stringify(relPath)}`,
        '',
        '/** Map of action name → request handler */',
        'export const actionHandlers = {',
    ]

    for (const action of actions) {
        lines.push(`  ${JSON.stringify(action.name)}: (req, res) => handleActionRequest(req, res),`)
    }

    lines.push('}')
    lines.push('')
    lines.push('/**')
    lines.push(' * Mount all action routes on an Express app.')
    lines.push(' * @param {import("express").Application} app')
    lines.push(' */')
    lines.push('export function mountActionRoutes(app) {')
    lines.push(`  const base = ${JSON.stringify(baseUrl)}`)
    lines.push('  for (const [name, handler] of Object.entries(actionHandlers)) {')
    lines.push('    app.post(`${base}/${name}`, handler)')
    lines.push('  }')
    lines.push('}')
    lines.push('')
    lines.push('/**')
    lines.push(' * Fetch API compatible dispatcher (Bun / Deno / CF Workers).')
    lines.push(' * @param {Request} request')
    lines.push(' */')
    lines.push('export async function dispatchAction(request) {')
    lines.push(`  const base = ${JSON.stringify(baseUrl)}`)
    lines.push('  const url  = new URL(request.url)')
    lines.push('  const name = url.pathname.slice(base.length + 1)')
    lines.push('  const handler = actionHandlers[name]')
    lines.push('  if (!handler) return new Response(JSON.stringify({ error: `Action "${name}" not found` }), { status: 404 })')
    lines.push('  return handler(request, null)')
    lines.push('}')
    lines.push('')

    return lines.join('\n')
}

export function generateActionTypes(actions) {
    const lines = [
        '// [fusée] Auto-generated action types — do not edit',
        '// Generated by compiler/plugins/actions-plugin.js',
        '',
        "import type { useAction } from '../core/actions.js'",
        '',
        '/** All registered server action names */',
        `export type ActionName = ${actions.map(a => JSON.stringify(a.name)).join(' | ') || 'never'}`,
        '',
        '/** Client proxy function for a server action */',
        'export type ActionProxy<TArgs extends unknown[] = unknown[], TReturn = unknown> =',
        '  ((...args: TArgs) => Promise<TReturn>) & {',
        '    _isAction: true',
        '    _actionName: string',
        '  }',
        '',
        '/** useAction() result shape */',
        'export type UseActionResult<TReturn = unknown> = {',
        '  execute: (...args: unknown[]) => Promise<TReturn | undefined>',
        '  pending: () => boolean',
        '  data: () => TReturn | undefined',
        '  error: () => Error | undefined',
        '  reset: () => void',
        '}',
        '',
        '/** Auto-generated action stubs */',
        'export declare const actionStubs: Record<ActionName, ActionProxy>',
        '',
    ]

    for (const action of actions) {
        lines.push(`export declare const ${action.exportName}: ActionProxy`)
    }

    lines.push('')
    lines.push("export { useAction } from '../core/actions.js'")
    lines.push('')

    return lines.join('\n')
}

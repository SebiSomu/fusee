// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const frameworkDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Imports a module in a separate plain Node process. Vite and vitest tolerate re-exports
 * of names that do not exist; Node's ESM linker rejects the whole module, so only a real
 * Node process catches them.
 */
function importInNode(relativePath) {
    const url = pathToFileURL(path.join(frameworkDir, relativePath)).href
    return execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log('ok')`], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
}

describe('public entry points load in plain Node', () => {
    it.each(['index.js', 'server/index.js', 'router/index.js', 'core/ssr.js', 'server-legacy/index.js'])('%s', (entry) => {
        expect(importInNode(entry)).toBe('ok')
    })
})

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
function importInNode(relativePath, after = `console.log('ok')`) {
    const url = pathToFileURL(path.join(frameworkDir, relativePath)).href
    return execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); ${after}`], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
}

const GLOBAL_NAMES = `console.log(['signal', 'defineComponent', 'defineStore', 'defineElement', 'emit'].filter(n => typeof globalThis[n] === 'function').join(','))`

describe('public entry points load in plain Node', () => {
    it.each(['index.js', 'globals.js', 'server/index.js', 'router/index.js', 'core/ssr.js', 'server-legacy/index.js'])('%s', (entry) => {
        expect(importInNode(entry)).toBe('ok')
    })
})

describe('globals are opt-in', () => {
    it('importing the main entry leaves globalThis untouched, so bundlers can tree-shake', () => {
        expect(importInNode('index.js', GLOBAL_NAMES)).toBe('')
    })

    it('importing fusee-framework/globals exposes the API on globalThis', () => {
        expect(importInNode('globals.js', GLOBAL_NAMES)).toBe('signal,defineComponent,defineStore,defineElement,emit')
    })
})

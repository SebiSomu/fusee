// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateManifest } from '../server/generate-manifest.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureApp = path.resolve(here, '../engine-go/testdata/elements-app')
const elementModule = pathToFileURL(path.resolve(here, '../core/element.js')).href

const tempDirs = []

/** Creates a temporary app with the given element modules and an empty pages dir. */
function tempApp(elementFiles) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusee-manifest-'))
    tempDirs.push(dir)
    fs.mkdirSync(path.join(dir, 'pages'))
    fs.mkdirSync(path.join(dir, 'elements'))
    for (const [name, source] of Object.entries(elementFiles)) {
        fs.writeFileSync(path.join(dir, 'elements', name), source)
    }
    return dir
}

/** Runs the generator quietly and returns the parsed manifest plus captured warnings. */
async function generate(options) {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await generateManifest(options)
    const manifest = JSON.parse(fs.readFileSync(path.join(options.outputDir, 'manifest.json'), 'utf-8'))
    return { manifest, warnings: warn.mock.calls.map(args => args.join(' ')) }
}

afterEach(() => {
    vi.restoreAllMocks()
    while (tempDirs.length) fs.rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe('generateManifest() elements', () => {
    it('matches the committed Go engine fixture', async () => {
        const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusee-fixture-'))
        tempDirs.push(outputDir)

        const { manifest } = await generate({
            pagesDir: path.join(fixtureApp, 'app/pages'),
            elementsDir: path.join(fixtureApp, 'app/elements'),
            outputDir
        })
        const committed = JSON.parse(fs.readFileSync(path.join(fixtureApp, 'manifest.json'), 'utf-8'))

        // Regenerate with: node -e "import('./framework/server/generate-manifest.js').then(m => m.generateManifest({ pagesDir: 'framework/engine-go/testdata/elements-app/app/pages', elementsDir: 'framework/engine-go/testdata/elements-app/app/elements', outputDir: 'framework/engine-go/testdata/elements-app' }))"
        expect({ ...manifest, generatedAt: null }).toEqual({ ...committed, generatedAt: null })
    })

    it('serializes props, styles, shadow options, and the template AST', async () => {
        const dir = tempApp({
            'card.js': `import { defineElement, css } from '${elementModule}'
defineElement('fu-mf-card', {
    props: { title: { type: String, default: 'T' }, items: { type: Array, default: () => [1] }, cb: { type: Function, default: () => {} }, open: { type: Boolean, reflect: true } },
    styles: [css\`a { color: red }\`, css\`b { color: blue }\`],
    shadow: { mode: 'closed', delegatesFocus: true },
    setup: (props) => ({ props, template: '<h1>{{ props.title }}</h1>' })
})`
        })

        const { manifest } = await generate({ pagesDir: path.join(dir, 'pages'), elementsDir: path.join(dir, 'elements'), outputDir: dir })
        const [card] = manifest.elements

        expect(card.tag).toBe('fu-mf-card')
        expect(card.props).toEqual([
            { name: 'title', attribute: 'title', type: 'String', default: 'T', reflect: false },
            { name: 'items', attribute: 'items', type: 'Array', default: [1], reflect: false },
            { name: 'cb', attribute: 'cb', type: 'Function', reflect: false },
            { name: 'open', attribute: 'open', type: 'Boolean', reflect: true }
        ])
        expect(card.styles).toBe('a { color: red }\nb { color: blue }')
        expect(card.shadow).toEqual({ mode: 'closed', delegatesFocus: true })
        expect(card.ast.type).toBe('Root')
        expect(card.ast.children[0].tag).toBe('h1')
    })

    it('skips light-DOM elements and setups without a string template', async () => {
        const dir = tempApp({
            'skips.js': `import { defineElement } from '${elementModule}'
defineElement('fu-mf-light', { shadow: false, setup: () => ({ template: '<p></p>' }) })
defineElement('fu-mf-rendered', { setup: () => ({}), render: () => [] })
defineElement('fu-mf-kept', { setup: () => ({ template: '<i></i>' }) })`
        })

        const { manifest } = await generate({ pagesDir: path.join(dir, 'pages'), elementsDir: path.join(dir, 'elements'), outputDir: dir })

        expect(manifest.elements.map(e => e.tag)).toEqual(['fu-mf-kept'])
    })

    it('warns and continues when a module cannot be imported', async () => {
        const dir = tempApp({
            'a-broken.js': `import './does-not-exist.js'`,
            'b-ok.js': `import { defineElement } from '${elementModule}'
defineElement('fu-mf-ok', { setup: () => ({ template: '<i></i>' }) })`
        })

        const { manifest, warnings } = await generate({ pagesDir: path.join(dir, 'pages'), elementsDir: path.join(dir, 'elements'), outputDir: dir })

        expect(manifest.elements.map(e => e.tag)).toEqual(['fu-mf-ok'])
        expect(warnings.some(w => w.includes('a-broken.js'))).toBe(true)
    })

    it('returns the same elements when run twice in one process', async () => {
        const dir = tempApp({
            'twice.js': `import { defineElement } from '${elementModule}'
defineElement('fu-mf-twice', { setup: () => ({ template: '<i></i>' }) })`
        })
        const options = { pagesDir: path.join(dir, 'pages'), elementsDir: path.join(dir, 'elements'), outputDir: dir }

        const first = await generate(options)
        const second = await generate(options)

        expect(second.manifest.elements).toEqual(first.manifest.elements)
        expect(second.manifest.elements.map(e => e.tag)).toEqual(['fu-mf-twice'])
    })

    it('writes an empty elements list when there is no elements directory', async () => {
        const dir = tempApp({})
        fs.rmSync(path.join(dir, 'elements'), { recursive: true })

        const { manifest } = await generate({ pagesDir: path.join(dir, 'pages'), elementsDir: path.join(dir, 'elements'), outputDir: dir })

        expect(manifest.elements).toEqual([])
    })
})

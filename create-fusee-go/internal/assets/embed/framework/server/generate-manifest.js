import fs from 'node:fs'
import { register } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compile } from '../core/compiler/main-compiler.js'
import { listElementDefinitions, resolveDefault } from '../core/element.js'
import { runElementSetup } from '../core/element-ssr.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '../../')
const defaultPagesDir = path.join(projectRoot, 'app/pages')
const defaultElementsDir = path.join(projectRoot, 'app/elements')
const defaultOutputDir = path.join(projectRoot, '.fusee')

/** Recursively collects source files that can contain application templates. */
function getAllFiles(dir, base = '') {
    const results = []
    if (!fs.existsSync(dir)) return results

    const list = fs.readdirSync(dir)
    for (const file of list) {
        const fullPath = path.join(dir, file)
        const relPath = path.join(base, file)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
            results.push(...getAllFiles(fullPath, relPath))
        } else if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.fusee') || file.endsWith('.fhtml')) {
            results.push({ fullPath, relPath: relPath.replace(/\\/g, '/') })
        }
    }
    return results
}

/** Extracts an inline template from a page source file. */
function extractTemplate(source) {
    let tpl = null
    const templateLiteralMatch = source.match(/template\s*:\s*`([\s\S]*?)`/)
    if (templateLiteralMatch) tpl = templateLiteralMatch[1].trim()

    if (!tpl) {
        const singleQuoteMatch = source.match(/template\s*:\s*'([\s\S]*?)'/)
        if (singleQuoteMatch) tpl = singleQuoteMatch[1].trim()
    }

    if (!tpl) {
        const doubleQuoteMatch = source.match(/template\s*:\s*"([\s\S]*?)"/)
        if (doubleQuoteMatch) tpl = doubleQuoteMatch[1].trim()
    }

    if (!tpl && source.trim().startsWith('<')) tpl = source.trim()
    if (!tpl) return null

    return tpl.replace(/\bf-link\b(?!=)/g, 'f-link="true"')
}

/** Converts a page-relative source path into its URL route pattern. */
function filePathToRoute(relPath) {
    let clean = relPath.replace(/\.[jt]sx?$/, '')
    if (clean.endsWith('/index')) clean = clean.slice(0, -6)
    if (clean === 'index' || clean === '') return '/'
    return '/' + clean
}

/** Returns a JSON-serializable copy of a value, or undefined when it cannot be serialized. */
function toJSONValue(value) {
    if (value === undefined || typeof value === 'function') return undefined
    try {
        return JSON.parse(JSON.stringify(value))
    } catch {
        return undefined
    }
}

/** Serializes one element definition for the Go engine: props, styles, shadow options, template AST. */
function serializeElement(definition, filePath) {
    const { tagName, propDefs, shadowInit, styleList } = definition
    if (!shadowInit) {
        console.log(`ℹ️ [Fusee Manifest] Skipped <${tagName}> (light-DOM elements render on the client)`)
        return null
    }

    const props = [...propDefs.values()].map(def => ({
        name: def.name,
        attribute: def.attribute ?? '',
        type: def.type?.name ?? '',
        default: toJSONValue(resolveDefault(def)),
        reflect: def.reflect
    }))

    const propsView = {}
    for (const def of propDefs.values()) {
        Object.defineProperty(propsView, def.name, { value: resolveDefault(def), enumerable: true })
    }

    let template
    const { state, dispose } = runElementSetup(definition, propsView)
    try {
        template = state?.template
    } finally {
        dispose()
    }
    if (typeof template !== 'string') {
        console.log(`ℹ️ [Fusee Manifest] Skipped <${tagName}> (Go SSR needs a string template from setup())`)
        return null
    }

    return {
        tag: tagName,
        filePath,
        props,
        styles: styleList.map(style => style.cssText).join('\n'),
        shadow: { mode: shadowInit.mode, delegatesFocus: !!shadowInit.delegatesFocus },
        ast: compile(template, { filename: filePath }).ast
    }
}

const frameworkDir = path.resolve(__dirname, '..')
let elementRuntimeReady = false

/**
 * Prepares plain Node to import app element modules the way Vite does:
 * - `fusee-framework` (and subpaths) resolves to this framework copy when normal
 *   resolution fails, as scaffolded apps only map it through a Vite alias;
 * - fusée's opt-in globals are installed first, standing in for Vite's auto-imports, so
 *   modules that call the API without importing it (bare `signal()`) work as well.
 */
async function prepareElementRuntime() {
    if (elementRuntimeReady) return
    elementRuntimeReady = true

    if (typeof register === 'function') {
        const frameworkUrl = pathToFileURL(frameworkDir + path.sep).href
        const hooks = `
            export async function resolve(specifier, context, next) {
                try {
                    return await next(specifier, context)
                } catch (err) {
                    if (specifier !== 'fusee-framework' && !specifier.startsWith('fusee-framework/')) throw err
                    const subpath = specifier === 'fusee-framework' ? 'index.js' : specifier.slice('fusee-framework/'.length)
                    const file = /\\.[cm]?[jt]s$/.test(subpath) ? subpath : subpath + '/index.js'
                    return next(new URL(file, ${JSON.stringify(frameworkUrl)}).href, context)
                }
            }`
        register('data:text/javascript,' + encodeURIComponent(hooks))
    }

    await import(pathToFileURL(path.join(frameworkDir, 'globals.js')).href)
}

/**
 * Tags registered by each imported element module. ES modules run once per process, so a
 * repeated generateManifest() call must reuse what the first import registered.
 */
const elementTagsByFile = new Map()

/** Imports an element module once and returns the tags its defineElement() calls registered. */
async function importElementModule(fullPath) {
    if (elementTagsByFile.has(fullPath)) return elementTagsByFile.get(fullPath)

    const before = new Set(listElementDefinitions().map(def => def.tagName))
    await import(pathToFileURL(fullPath).href)
    const tags = listElementDefinitions().map(def => def.tagName).filter(tag => !before.has(tag))
    elementTagsByFile.set(fullPath, tags)
    return tags
}

/**
 * Imports every module in the elements directory so its defineElement() calls register,
 * then serializes the definitions. Modules must be importable in Node.
 */
async function collectElements(elementsDir) {
    const elements = []
    const files = getAllFiles(elementsDir)
        .filter(({ relPath }) => /\.(m?js|ts)$/.test(relPath) && !relPath.includes('.test.') && !relPath.includes('.spec.'))

    if (files.length > 0) await prepareElementRuntime()

    for (const { fullPath, relPath } of files) {
        const filePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/')

        let tags
        try {
            tags = await importElementModule(fullPath)
        } catch (err) {
            console.warn(`⚠️ [Fusee Manifest] Failed to import ${relPath}:`, err.message)
            continue
        }

        for (const definition of listElementDefinitions()) {
            if (!tags.includes(definition.tagName)) continue
            try {
                const entry = serializeElement(definition, filePath)
                if (entry) {
                    elements.push(entry)
                    console.log(`✅ [Fusee Manifest] Element registered: <${entry.tag}> (${relPath})`)
                }
            } catch (err) {
                console.warn(`⚠️ [Fusee Manifest] Failed to compile <${definition.tagName}> in ${relPath}:`, err.message)
            }
        }
    }

    return elements
}

/** Compiles application pages and custom elements and writes the manifest consumed by SSR. */
export async function generateManifest(options = {}) {
    const pagesDir = options.pagesDir ?? defaultPagesDir
    const elementsDir = options.elementsDir ?? defaultElementsDir
    const outputDir = options.outputDir ?? defaultOutputDir
    const manifestFile = path.join(outputDir, 'manifest.json')

    console.log('🔍 [Fusee Manifest] Scanning pages in:', pagesDir)
    const files = getAllFiles(pagesDir)
    const routes = []

    for (const { fullPath, relPath } of files) {
        if (path.basename(relPath).startsWith('_layout')) continue
        if (relPath.includes('.test.') || relPath.includes('.spec.')) continue

        const pattern = filePathToRoute(relPath)
        const source = fs.readFileSync(fullPath, 'utf-8')
        const template = extractTemplate(source)

        if (!template) {
            console.log(`ℹ️ [Fusee Manifest] Skipped ${relPath} (no inline template found)`)
            continue
        }

        try {
            const compiled = compile(template, { filename: relPath })
            if (compiled && compiled.ast) {
                const title = path.basename(relPath, path.extname(relPath))
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase())

                routes.push({
                    pattern,
                    filePath: `app/pages/${relPath}`,
                    title,
                    ast: compiled.ast
                })
                console.log(`✅ [Fusee Manifest] Route registered: ${pattern} (${relPath})`)
            }
        } catch (err) {
            console.warn(`⚠️ [Fusee Manifest] Failed to compile template in ${relPath}:`, err.message)
        }
    }

    const elements = await collectElements(elementsDir)

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const manifest = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        routes,
        elements
    }

    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8')
    console.log(`✨ [Fusee Manifest] Successfully written ${routes.length} routes and ${elements.length} elements to ${manifestFile}`)
    return manifest
}

if (process.argv[1] === __filename) {
    generateManifest().catch(err => {
        console.error('❌ [Fusee Manifest] Failed:', err)
        process.exitCode = 1
    })
}

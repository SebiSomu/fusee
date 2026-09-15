import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '../core/compiler/main-compiler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '../../')
const pagesDir = path.join(projectRoot, 'app/pages')
const outputDir = path.join(projectRoot, '.fusee')
const manifestFile = path.join(outputDir, 'manifest.json')

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

function filePathToRoute(relPath) {
    let clean = relPath.replace(/\.[jt]sx?$/, '')
    if (clean.endsWith('/index')) clean = clean.slice(0, -6)
    if (clean === 'index' || clean === '') return '/'
    return '/' + clean
}

export function generateManifest() {
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

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const manifest = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        routes
    }

    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf-8')
    console.log(`✨ [Fusee Manifest] Successfully written ${routes.length} routes to ${manifestFile}`)
    return manifest
}

if (process.argv[1] === __filename) {
    generateManifest()
}

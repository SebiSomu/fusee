import * as ssrRuntime from './ssr.js'
import { compile } from './compiler/main-compiler.js'
import { getElementDefinition, createElementFactory, propFromAttribute, propToAttribute, resolveDefault } from './element.js'

const MAX_DEPTH = 50

/**
 * Matches, in order: comments, raw-text elements (whose content must not be scanned),
 * and opening tags of potential custom elements (a hyphen in the name).
 */
const SCAN_RE = /<!--[\s\S]*?-->|<(script|style|textarea|title)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/\1\s*>|<([a-zA-Z][a-zA-Z0-9]*-[a-zA-Z0-9._-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
const EXISTING_SHADOW_RE = /^\s*<template\s[^>]*\bshadowrootmode\s*=/i

const templateRenderers = new Map()

/**
 * Slots context for SSR: every outlet renders as a native <slot>. Fallback content is
 * not rendered on the server; the client re-render restores it.
 */
const SSR_SLOT_OUTLETS = new Proxy({}, {
    get(_, name) {
        if (typeof name !== 'string') return undefined
        return () => name === 'default'
            ? '<slot></slot>'
            : `<slot name="${ssrRuntime.escapeAttr(name)}"></slot>`
    }
})

const SSR_LISTENERS = new Proxy({}, { get: () => () => {} })

/** Decodes the HTML entities that SSR escaping produces in attribute values. */
function decodeEntities(value) {
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
        const lower = entity.toLowerCase()
        if (lower === 'amp') return '&'
        if (lower === 'lt') return '<'
        if (lower === 'gt') return '>'
        if (lower === 'quot') return '"'
        if (lower === 'apos') return "'"
        if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16))
        return String.fromCodePoint(parseInt(lower.slice(1), 10))
    })
}

/** Parses an opening tag's attribute text into a lowercase-name → decoded-value map. */
function parseAttributes(attrText) {
    const attrs = new Map()
    ATTR_RE.lastIndex = 0
    let match
    while ((match = ATTR_RE.exec(attrText)) !== null) {
        const value = match[2] ?? match[3] ?? match[4]
        attrs.set(match[1].toLowerCase(), value === undefined ? '' : decodeEntities(value))
    }
    return attrs
}

/** Compiles a string template to an SSR render function once, and caches it. */
function getTemplateRenderer(template, tagName) {
    let renderer = templateRenderers.get(template)
    if (renderer) return renderer

    const { ssrCode } = compile(template, { filename: `<${tagName}>`, target: 'ssr' })
    const body = ssrCode
        .replace(/^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];?/m, (_, names) => `const {${names}} = __runtime;`)
        .replace(/export\s+async\s+function\s+renderSSR/, 'async function renderSSR')
    renderer = new Function('__runtime', `${body}\nreturn renderSSR`)(ssrRuntime)
    templateRenderers.set(template, renderer)
    return renderer
}

/** Adapts defineComponent() factories so renderComponentSSR() can render them in templates. */
function toSSRComponents(components, tagName) {
    const out = {}
    for (const name of Object.keys(components || {})) {
        const options = components[name]?._options
        if (!options) continue
        out[name] = {
            setup: options.setup || (() => ({})),
            renderSSR: (state) => {
                const nested = toSSRComponents(options.components, tagName)
                if (options.renderSSR) return options.renderSSR(state, nested)
                if (typeof state?.template !== 'string') return ''
                return getTemplateRenderer(state.template, tagName)(state, nested)
            }
        }
    }
    return out
}

/** Serializes styles for a declarative shadow root, keeping `</style>` from closing the tag. */
function renderStyles(styleList) {
    return styleList
        .map(style => `<style>${style.cssText.replace(/<\/style/gi, '<\\/style')}</style>`)
        .join('')
}

/**
 * Runs an element's setup outside the DOM (no host, no shadow root) and returns its state.
 * dispose() stops the effects setup created, without running unmount hooks.
 */
export function runElementSetup(definition, propsView) {
    const factory = createElementFactory(definition, null, null)
    const { instance } = factory(propsView, { listeners: SSR_LISTENERS, slots: {} })
    return {
        state: instance.state,
        instance,
        dispose() {
            for (const cleanup of instance._effects.splice(0)) {
                if (typeof cleanup === 'function') 
                    cleanup()
            }
        }
    }
}

/** Runs an element's setup with props from its attributes and renders its shadow content. */
async function renderShadowContent(definition, attrs) {
    const propsView = {}
    const extraAttrs = []

    for (const def of definition.propDefs.values()) {
        const hasAttr = def.attribute !== null && attrs.has(def.attribute)
        const value = hasAttr ? propFromAttribute(def, attrs.get(def.attribute)) : resolveDefault(def)
        Object.defineProperty(propsView, def.name, { value, enumerable: true })

        if (def.reflect && !hasAttr) {
            const attrValue = propToAttribute(def, value)
            if (attrValue !== null) extraAttrs.push([def.attribute, attrValue])
        }
    }

    const { state, instance, dispose } = runElementSetup(definition, propsView)

    try {
        if (state && typeof state === 'object') state._slots = SSR_SLOT_OUTLETS

        const components = toSSRComponents(instance._components, definition.tagName)
        const { renderSSR } = definition.componentOptions
        let html = ''
        if (typeof renderSSR === 'function') {
            html = await renderSSR(state, components)
        } else if (typeof state?.template === 'string') {
            html = await getTemplateRenderer(state.template, definition.tagName)(state, components)
        }
        return { html, extraAttrs }
    } finally {
        dispose()
    }
}

/** Builds the `<template shadowrootmode>` opening tag for a definition's shadow options. */
function shadowTemplateOpenTag(shadowInit) {
    let tag = `<template shadowrootmode="${shadowInit.mode === 'closed' ? 'closed' : 'open'}"`
    if (shadowInit.delegatesFocus) tag += ' shadowrootdelegatesfocus'
    return tag + '>'
}

/**
 * Server-renders every element registered with defineElement() in an HTML string as
 * declarative shadow DOM, so its content and styles show before JavaScript loads.
 * Works on any HTML: compiled renderSSR() output, Go engine pages, or static markup.
 * Elements nested in shadow content are rendered too. Light-DOM elements (shadow: false)
 * and elements that already carry a declarative shadow root are left unchanged.
 */
export async function renderElementsSSR(html, depth = 0) {
    if (depth > MAX_DEPTH) {
        throw new Error(`[fusée] renderElementsSSR(): elements nested deeper than ${MAX_DEPTH} levels (recursive element?)`)
    }

    let out = ''
    let lastIndex = 0
    const matches = [...html.matchAll(SCAN_RE)]

    for (const match of matches) {
        const tagName = match[2]
        const definition = tagName ? getElementDefinition(tagName) : null
        if (!definition || !definition.shadowInit) continue

        const end = match.index + match[0].length
        if (EXISTING_SHADOW_RE.test(html.slice(end, end + 200))) continue

        let attrText = match[3]
        const selfClosing = /\/\s*$/.test(attrText)
        if (selfClosing) attrText = attrText.replace(/\/\s*$/, '')

        const { html: shadowHtml, extraAttrs } = await renderShadowContent(definition, parseAttributes(attrText))
        const renderedShadow = await renderElementsSSR(shadowHtml, depth + 1)
        const reflected = extraAttrs
            .map(([name, value]) => value === '' ? ` ${name}` : ` ${name}="${ssrRuntime.escapeAttr(value)}"`)
            .join('')

        out += html.slice(lastIndex, match.index)
        out += `<${tagName}${attrText}${reflected}>`
        out += shadowTemplateOpenTag(definition.shadowInit)
        out += renderStyles(definition.styleList) + renderedShadow
        out += '</template>'
        if (selfClosing) out += `</${tagName}>`
        lastIndex = end
    }

    return out + html.slice(lastIndex)
}

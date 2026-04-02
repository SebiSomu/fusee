import { effect, batch } from './signal.js'

export function mountTemplate(template, container, context, components) {
    const effects = []

    let processed = template.replace(/(<[a-zA-Z0-9-]+\s[^>]*?)\s:([a-zA-Z][a-zA-Z0-9-]*)=/g, '$1 data-bind-$2=')

    for (const name of Object.keys(components)) {
        const re = new RegExp(`\\{\\{\\s*${name}(.*?)\\}\\}`, 'g')
        processed = processed.replace(re, (match, propsStr) => {
            let attrs = ''
            if (propsStr && propsStr.trim()) {
                const attrRegex = /(:?[a-zA-Z0-9-]+)="([^"]*)"/g
                let attrMatch
                while ((attrMatch = attrRegex.exec(propsStr)) !== null) {
                    const attrName = attrMatch[1]
                    const attrValue = attrMatch[2]

                    if (attrName.startsWith(':')) {
                        attrs += ` data-bind-prop-${attrName.slice(1)}="${attrValue}"`
                    } else {
                        attrs += ` data-prop-${attrName}="${attrValue}"`
                    }
                }
            }
            return `<div data-component="${name}"${attrs}></div>`
        })
    }

    container.innerHTML = processed
    compileNode(container, context, components, effects)

    return { effects }
}

export function compileNode(node, context, components, effects) {
    processDirectives(node, context, components, effects)
    processTextNodes(node, context, effects)
    processAttrBindings(node, context, effects)
    bindEvents(node, context)
    bindComponents(node, components, context, effects)
}

const MUSTACHE_RE = /\{\{\s*(.+?)\s*\}\}/

function processTextNodes(root, context, effects) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const targets = []

    let node
    while ((node = walker.nextNode())) {
        if (MUSTACHE_RE.test(node.textContent)) {
            targets.push(node)
        }
    }

    for (const textNode of targets) {
        const parts = parseInterpolation(textNode.textContent)
        const fragment = document.createDocumentFragment()

        for (const part of parts) {
            if (part.type === 'static') {
                fragment.appendChild(document.createTextNode(part.value))
            } else {
                const reactiveNode = document.createTextNode('')
                fragment.appendChild(reactiveNode)

                const key = part.key
                const e = effect(() => {
                    const resolved = evaluateExpression(key, context)
                    reactiveNode.textContent = String(resolved ?? '')
                })
                effects.push(e)
            }
        }

        textNode.parentNode.replaceChild(fragment, textNode)
    }
}

function processAttrBindings(root, context, effects) {
    const all = root.querySelectorAll('*')

    for (const el of all) {
        for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('data-bind-')) {
                const realAttr = attr.name.slice(10)
                const expr = attr.value
                el.removeAttribute(attr.name)

                const e = effect(() => {
                    const resolved = evaluateExpression(expr, context)

                    if (typeof resolved === 'boolean') {
                        resolved
                            ? el.setAttribute(realAttr, '')
                            : el.removeAttribute(realAttr)
                    } else {
                        const safeValue = sanitizeAttr(realAttr, String(resolved))
                        el.setAttribute(realAttr, safeValue)
                    }
                })
                effects.push(e)
                continue
            }

            if (MUSTACHE_RE.test(attr.value)) {
                const attrName = attr.name
                const parts = parseInterpolation(attr.value)
                el.removeAttribute(attrName)

                const e = effect(() => {
                    let result = ''
                    for (const part of parts) {
                        if (part.type === 'static') {
                            result += part.value
                        } else {
                            const resolved = evaluateExpression(part.key, context)
                            result += String(resolved ?? '')
                        }
                    }
                    const safeValue = sanitizeAttr(attrName, result)
                    el.setAttribute(attrName, safeValue)
                })
                effects.push(e)
            }
        }
    }
}

function processDirectives(root, context, components, effects) {
    processFor(root, context, components, effects)
    processIf(root, context, components, effects)
    processShow(root, context, effects)
}

function processFor(root, context, components, effects) {
    const forEls = root.querySelectorAll('[f-for]')
    for (const el of forEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-for')
        el.removeAttribute('f-for')

        const match = expr.match(/^\s*(?:(?:\(\s*([a-zA-Z_$][0-9a-zA-Z_$]*)\s*,\s*([a-zA-Z_$][0-9a-zA-Z_$]*)\s*\))|([a-zA-Z_$][0-9a-zA-Z_$]*))\s+in\s+(.+)\s*$/)
        if (!match) {
            console.warn(`[framework] Invalid f-for expression: "${expr}"`)
            continue
        }

        const itemName = match[3] || match[1]
        const indexName = match[2]
        const arrayExpr = match[4]

        const anchor = document.createComment('f-for')
        const parent = el.parentNode
        parent.insertBefore(anchor, el)

        const templateNode = el.cloneNode(true)
        parent.removeChild(el)

        let previousNodes = []
        let previousEffects = []

        effects.push(effect(() => {
            const rawItems = evaluateExpression(arrayExpr, context)
            const list = Array.isArray(rawItems) ? rawItems : []

            for (const e of previousEffects) {
                if (typeof e === 'function') e()
            }
            for (const node of previousNodes) {
                node.parentNode?.removeChild(node)
            }
            previousNodes = []
            previousEffects = []

            const fragment = document.createDocumentFragment()

            list.forEach((item, index) => {
                const clone = templateNode.cloneNode(true)
                const childContext = Object.create(context)
                childContext[itemName] = item
                if (indexName) childContext[indexName] = index

                const childEffects = []
                compileNode(clone, childContext, components, childEffects)

                fragment.appendChild(clone)
                previousNodes.push(clone)
                previousEffects.push(...childEffects)
            })

            anchor.parentNode.insertBefore(fragment, anchor)
        }))
    }
}

function processIf(root, context, components, effects) {
    const ifEls = root.querySelectorAll('[f-if]')
    for (const el of ifEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-if')
        el.removeAttribute('f-if')

        const anchor = document.createComment('f-if')
        const parent = el.parentNode
        parent.insertBefore(anchor, el)

        const templateNode = el.cloneNode(true)
        parent.removeChild(el)

        let currentUserNode = null
        let childEffects = []

        effects.push(effect(() => {
            const val = evaluateExpression(expr, context)
            if (val && !currentUserNode) {
                currentUserNode = templateNode.cloneNode(true)
                compileNode(currentUserNode, context, components, childEffects)
                anchor.parentNode.insertBefore(currentUserNode, anchor.nextSibling)
            } else if (!val && currentUserNode) {
                for (const e of childEffects) {
                    if (typeof e === 'function') e()
                }
                childEffects = []
                currentUserNode.parentNode.removeChild(currentUserNode)
                currentUserNode = null
            }
        }))
    }
}

function processShow(root, context, effects) {
    const showEls = root.querySelectorAll('[f-show]')
    for (const el of showEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-show')
        el.removeAttribute('f-show')
        const originalDisplay = el.style.display === 'none' ? '' : el.style.display

        effects.push(effect(() => {
            const val = evaluateExpression(expr, context)
            el.style.display = val ? originalDisplay : 'none'
        }))
    }
}

const SENSITIVE_ATTRS = ['href', 'src', 'srcset', 'formaction', 'xlink:href', 'data']
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file):/i

function sanitizeAttr(name, value) {
    const attrName = name.toLowerCase()
    if (SENSITIVE_ATTRS.includes(attrName)) {
        const trimmed = value.trim()
        if (DANGEROUS_SCHEMES.test(trimmed)) {
            console.warn(`[framework] Blocked potential XSS on ${name}: "${value}"`)
            return 'about:blank'
        }
    }
    return value
}

function evaluateExpression(expr, context) {
    const keys = []
    const values = []

    for (const k in context) {
        keys.push(k)
        const val = context[k]
        values.push(val?.isSignal ? val() : val)
    }

    try {
        const fn = new Function(...keys, `return ${expr}`)
        return fn(...values)
    } catch (e) {
        console.warn(`[framework] Error evaluating expression "${expr}":`, e)
        return ''
    }
}

function parseInterpolation(str) {
    const parts = []
    const regex = /\{\{\s*(.+?)\s*\}\}/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(str)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'static', value: str.slice(lastIndex, match.index) })
        }
        parts.push({ type: 'dynamic', key: match[1] })
        lastIndex = regex.lastIndex
    }

    if (lastIndex < str.length) {
        parts.push({ type: 'static', value: str.slice(lastIndex) })
    }

    return parts
}

function bindEvents(container, context) {
    const all = container.querySelectorAll('*')
    for (const el of all) {
        for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('@')) {
                const eventName = attr.name.slice(1)
                const handlerName = attr.value
                const handler = context[handlerName]
                if (typeof handler === 'function') {
                    el.removeAttribute(attr.name)
                    el.addEventListener(eventName, (e) => {
                        batch(() => handler(e))
                    })
                }
            }
        }
    }
}

function bindComponents(container, components, context, effects) {
    const placeholders = container.querySelectorAll('[data-component]')
    const els = container.matches && container.matches('[data-component]') ? [container, ...placeholders] : placeholders
    for (const placeholder of els) {
        const name = placeholder.dataset.component
        const ComponentFn = components[name]
        if (ComponentFn) {
            const props = {}
            for (const attr of [...placeholder.attributes]) {
                if (attr.name.startsWith('data-prop-')) {
                    props[attr.name.slice(10)] = attr.value
                } else if (attr.name.startsWith('data-bind-prop-')) {
                    const propName = attr.name.slice(15)
                    const parentKey = attr.value

                    Object.defineProperty(props, propName, {
                        get() {
                            const val = context[parentKey]
                            return typeof val === 'function' && val.isSignal ? val() : val
                        },
                        enumerable: true
                    })
                }
            }
            const child = ComponentFn(props)
            child.render(placeholder)
            if (effects) {
                effects.push(() => child.unmount())
            }
        }
    }
}

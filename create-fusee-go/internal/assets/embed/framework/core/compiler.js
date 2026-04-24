import { effect, batch } from './signal.js'
import { processDirectives } from './directives.js'
import { parseSlots } from './component.js'
import {
    evaluateExpression,
    parseInterpolation,
    sanitizeAttr,
    MUSTACHE_RE
} from './evaluator.js'

export function mountTemplate(template, container, context, components) {
    const effects = []
    let processed = template.replace(/(<[a-zA-Z0-9-]+\s[^>]*?)\s:([a-zA-Z][a-zA-Z0-9-]*)=/g, '$1 data-bind-$2=')

    for (const name of Object.keys(components)) {
        const reWithSlot = new RegExp(
            `\\{\\{\\s*${name}(\\s[^}]*?|\\s*)\\}\\}([\\s\\S]*?)\\{\\{\\s*\\/${name}\\s*\\}\\}`,
            'g'
        )
        const reNoSlot = new RegExp(`\\{\\{\\s*${name}(\\s+.*?|\\s*)\\}\\}`, 'g')

        processed = processed.replace(reWithSlot, (match, propsStr, slotContent) => {
            const attrs = parseComponentAttrs(propsStr || '')
            const encodedSlot = encodeURIComponent(slotContent.trim())
            return `<div data-component="${name}"${attrs} data-slot="${encodedSlot}"></div>`
        })

        processed = processed.replace(reNoSlot, (match, propsStr) => {
            const attrs = parseComponentAttrs(propsStr || '')
            return `<div data-component="${name}"${attrs}></div>`
        })
    }

    container.innerHTML = processed
    compileNode(container, context, components, effects)

    return { effects }
}

function parseComponentAttrs(propsStr) {
    let attrs = ''
    if (!propsStr || !propsStr.trim()) return attrs

    const attrRegex = /(@?:?[a-zA-Z0-9-]+)="([^"]*)"/g
    let attrMatch
    while ((attrMatch = attrRegex.exec(propsStr)) !== null) {
        const attrName = attrMatch[1]
        const attrValue = attrMatch[2]

        if (attrName.startsWith('@')) {
            attrs += ` data-on-${attrName.slice(1).toLowerCase()}="${attrValue}"`
        } else if (attrName.startsWith(':')) {
            attrs += ` data-bind-prop-${attrName.slice(1).toLowerCase()}="${attrValue}"`
        } else {
            attrs += ` data-prop-${attrName.toLowerCase()}="${attrValue}"`
        }
    }
    return attrs
}

export function compileNode(node, context, components, effects) {
    if (node.nodeType === 1 && node.hasAttribute('f-once')) {
        node.removeAttribute('f-once')
        const temporaryEffects = []

        processDirectives(node, context, components, temporaryEffects)
        processBindingAttrs(node, context, temporaryEffects)
        processMustaches(node, context, temporaryEffects)
        bindComponents(node, components, context, temporaryEffects)

        let child = node.firstChild
        while (child) {
            compileOnce(child, context, components, temporaryEffects)
            child = child.nextSibling
        }

        for (let i = temporaryEffects.length - 1; i >= 0; i--) {
            const cleanup = temporaryEffects[i]
            if (typeof cleanup === 'function') cleanup()
        }
        return
    }

    if (node.nodeType === 1) {
        if (processDirectives(node, context, components, effects)) return
        processBindingAttrs(node, context, effects)
        bindComponents(node, components, context, effects)
    } else if (node.nodeType === 3) {
        processMustaches(node, context, effects)
    }

    let child = node.firstChild
    while (child) {
        compileNode(child, context, components, effects)
        child = child.nextSibling
    }
}

function compileOnce(node, context, components, effects) {
    if (node.nodeType === 1) {
        if (processDirectives(node, context, components, effects)) return
        processBindingAttrs(node, context, effects)
        bindComponents(node, components, context, effects)
    } else if (node.nodeType === 3) {
        processMustaches(node, context, effects)
    }

    let child = node.firstChild
    while (child) {
        compileOnce(child, context, components, effects)
        child = child.nextSibling
    }
}

function processMustaches(node, context, effects) {
    if (node.nodeType !== 3) return
    const text = node.textContent
    if (!MUSTACHE_RE.test(text)) return

    const parts = parseInterpolation(text)
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
    node.parentNode.replaceChild(fragment, node)
}

function processBindingAttrs(el, context, effects) {
    if (el.nodeType !== 1) return
    for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('data-bind-') && !attr.name.startsWith('data-bind-prop-')) {
            const realAttr = attr.name.slice(10)
            const expr = attr.value
            el.removeAttribute(attr.name)

            const e = effect(() => {
                let resolved = evaluateExpression(expr, context)
                if (realAttr === 'class') {
                    if (!el._staticClass) el._staticClass = el.getAttribute('class') || ''
                    let dynamicClass = ''
                    if (Array.isArray(resolved)) dynamicClass = resolved.filter(Boolean).join(' ')
                    else if (resolved !== null && typeof resolved === 'object') {
                        dynamicClass = Object.entries(resolved).filter(([_, v]) => !!v).map(([k]) => k).join(' ')
                    } else dynamicClass = String(resolved ?? '')
                    el.className = (el._staticClass + ' ' + dynamicClass).trim()
                } else if (realAttr === 'style') {
                    if (resolved !== null && typeof resolved === 'object') {
                        for (const k in resolved) el.style[k] = resolved[k]
                    } else el.style.cssText = String(resolved ?? '')
                } else {
                    if (typeof resolved === 'boolean') {
                        resolved ? el.setAttribute(realAttr, '') : el.removeAttribute(realAttr)
                    } else el.setAttribute(realAttr, sanitizeAttr(realAttr, String(resolved)))
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
                    result += part.type === 'static' ? part.value : String(evaluateExpression(part.key, context) ?? '')
                }
                el.setAttribute(attrName, sanitizeAttr(attrName, result))
            })
            effects.push(e)
        }
    }
}

function bindComponents(el, components, context, effects) {
    if (el.nodeType !== 1) return
    const name = el.getAttribute('data-component')
    if (!name) return

    el.removeAttribute('data-component')

    const ComponentFn = components[name]
    if (!ComponentFn) return

    const props = {}
    const listeners = {}

    for (const attr of [...el.attributes]) {
        const attrName = attr.name.toLowerCase()

        if (attrName.startsWith('data-prop-')) {
            props[attrName.slice(10)] = attr.value

        } else if (attrName.startsWith('data-bind-prop-')) {
            const propName = attrName.slice(15)
            const expression = attr.value.trim()

            if (expression in context) {
                Object.defineProperty(props, propName, {
                    get() {
                        const val = context[expression]
                        return typeof val === 'function' && val.isSignal ? val() : val
                    },
                    enumerable: true,
                    configurable: true
                })
            } else {
                Object.defineProperty(props, propName, {
                    get() { return evaluateExpression(expression, context) },
                    enumerable: true,
                    configurable: true
                })
            }

        } else if (attrName.startsWith('data-on-')) {
            const eventName = attrName.slice(8)
            const handlerExpr = attr.value.trim()

            listeners[eventName] = (...args) => {
                const handler = context[handlerExpr]
                if (typeof handler === 'function') {
                    handler(...args)
                } else {
                    evaluateExpression(handlerExpr, context)
                }
            }
        }
    }

    const rawSlot = el.getAttribute('data-slot')
    const slots = rawSlot ? parseSlots(decodeURIComponent(rawSlot)) : {}
    el.removeAttribute('data-slot')

    const childComponent = ComponentFn(props, { listeners, slots, parent: context._instance })
    childComponent.render(el)

    if (effects) {
        effects.push(() => childComponent.unmount())
    }
}
import { effect, batch } from './signal.js'
import { processDirectives } from './directives.js'
import {
    evaluateExpression,
    parseInterpolation,
    sanitizeAttr,
    MUSTACHE_RE
} from './evaluator.js'

/**
 * Mounts a template into a container with a given context and components.
 */
export function mountTemplate(template, container, context, components) {
    const effects = []

    // Pre-processing for :attr="expr" bindings
    let processed = template.replace(/(<[a-zA-Z0-9-]+\s[^>]*?)\s:([a-zA-Z][a-zA-Z0-9-]*)=/g, '$1 data-bind-$2=')

    // Component placeholder replacement
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

/**
 * Compiles a DOM tree by applying directives, text nodes, attribute bindings, events, and component binding.
 */
export function compileNode(node, context, components, effects) {
    processDirectives(node, context, components, effects)
    processTextNodes(node, context, effects)
    processAttrBindings(node, context, effects)
    bindEvents(node, context)
    bindComponents(node, components, context, effects)
}

/**
 * Handles text node interpolation with mustache syntax.
 */
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

/**
 * Handles attribute bindings for reactive attributes.
 */
function processAttrBindings(root, context, effects) {
    const all = root.querySelectorAll('*')

    for (const el of all) {
        for (const attr of [...el.attributes]) {
            // :attr or data-bind-
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

            // mustache in attribute value
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

/**
 * Binds event listeners specified with @attribute="@handler".
 */
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

/**
 * Binds components to their placeholders with props passing.
 */
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

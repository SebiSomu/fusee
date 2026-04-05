import { effect, batch } from './signal.js'
import { processDirectives } from './directives.js'
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
        const re = new RegExp(`\\{\\{\\s*${name}(\\s+.*?|\\s*)\\}\\}`, 'g')
        processed = processed.replace(re, (match, propsStr) => {
            let attrs = ''
            if (propsStr && propsStr.trim()) {
                const attrRegex = /(:?[a-zA-Z0-9-]+)="([^"]*)"/g
                let attrMatch
                while ((attrMatch = attrRegex.exec(propsStr)) !== null) {
                    const attrName = attrMatch[1]
                    const attrValue = attrMatch[2]

                    if (attrName.startsWith(':')) {
                        attrs += ` data-bind-prop-${attrName.slice(1).toLowerCase()}="${attrValue}"`
                    } else {
                        attrs += ` data-prop-${attrName.toLowerCase()}="${attrValue}"`
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
    // Handle f-once (render once and discard reactive tracking for this subtree)
    if (node.nodeType === 1 && node.hasAttribute('f-once')) {
        node.removeAttribute('f-once')
        const temporaryEffects = []

        // Process ONLY this node and its children ONCE
        processDirectives(node, context, components, temporaryEffects)
        processAttributes(node, context, temporaryEffects)
        processText(node, context, temporaryEffects)
        bindComponents(node, components, context, temporaryEffects)

        // Recurse children but with temporary effects
        let child = node.firstChild
        while (child) {
            compileOnce(child, context, components, temporaryEffects)
            child = child.nextSibling
        }

        // Cleanup immediately
        for (const cleanup of temporaryEffects) if (typeof cleanup === 'function') cleanup()
        return
    }

    if (node.nodeType === 1) {
        processDirectives(node, context, components, effects)
        processAttributes(node, context, effects)
        bindComponents(node, components, context, effects)
    } else if (node.nodeType === 3) {
        processText(node, context, effects)
    }

    let child = node.firstChild
    while (child) {
        compileNode(child, context, components, effects)
        child = child.nextSibling
    }
}

function compileOnce(node, context, components, effects) {
    if (node.nodeType === 1) {
        processDirectives(node, context, components, effects)
        processAttributes(node, context, effects)
        bindComponents(node, components, context, effects)
    } else if (node.nodeType === 3) {
        processText(node, context, effects)
    }

    let child = node.firstChild
    while (child) {
        compileOnce(child, context, components, effects)
        child = child.nextSibling
    }
}

function processText(node, context, effects) {
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

function processAttributes(el, context, effects) {
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

function processAttrBindings(root, context, effects) {
    const all = root.querySelectorAll('*')

    for (const el of all) {
        for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('data-bind-') && !attr.name.startsWith('data-bind-prop-')) {
                const realAttr = attr.name.slice(10)
                const expr = attr.value
                el.removeAttribute(attr.name)

                const e = effect(() => {
                    let resolved = evaluateExpression(expr, context)

                    if (realAttr === 'class') {
                        const staticClass = el.getAttribute('class') || ''
                        let dynamicClass = ''
                        if (Array.isArray(resolved)) {
                            dynamicClass = resolved.filter(Boolean).join(' ')
                        } else if (resolved !== null && typeof resolved === 'object') {
                            dynamicClass = Object.entries(resolved)
                                .filter(([_, value]) => !!value)
                                .map(([key, _]) => key)
                                .join(' ')
                        } else {
                            dynamicClass = String(resolved ?? '')
                        }
                        // Use a data attribute to store the original static class to avoid losing it on updates
                        if (!el._staticClass) el._staticClass = el.getAttribute('class') || ''
                        el.className = (el._staticClass + ' ' + dynamicClass).trim()
                    } else if (realAttr === 'style') {
                        if (resolved !== null && typeof resolved === 'object') {
                            for (const key in resolved) {
                                el.style[key] = resolved[key]
                            }
                        } else {
                            el.style.cssText = String(resolved ?? '')
                        }
                    } else {
                        // Standard attribute behavior
                        if (typeof resolved === 'boolean') {
                            resolved
                                ? el.setAttribute(realAttr, '')
                                : el.removeAttribute(realAttr)
                        } else {
                            const safeValue = sanitizeAttr(realAttr, String(resolved))
                            el.setAttribute(realAttr, safeValue)
                        }
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



function bindComponents(container, components, context, effects) {
    const placeholders = container.querySelectorAll('[data-component]')
    const els = container.matches && container.matches('[data-component]') ? [container, ...placeholders] : placeholders
    for (const placeholder of els) {
        const name = placeholder.dataset.component
        const ComponentFn = components[name]
        if (ComponentFn) {
            const props = {}
            for (const attr of [...placeholder.attributes]) {
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
                            get() {
                                return evaluateExpression(expression, context)
                            },
                            enumerable: true,
                            configurable: true
                        })
                    }
                }
            }
            const childComponent = ComponentFn(props)
            childComponent.render(placeholder)
            if (effects) {
                effects.push(() => childComponent.unmount())
            }
        }
    }
}
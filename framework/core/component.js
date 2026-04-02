import { effect, setEffectHook, batch } from './signal.js'

let currentInstance = null

setEffectHook(eff => {
    if (currentInstance) currentInstance._effects.push(eff)
})

function resolveProps(schema, received) {
    const isArray = Array.isArray(schema)
    const resolved = {}

    if (isArray) {
        for (const key of schema) {
            if (!(key in received)) {
                console.warn(`[framework] Missing prop "${key}"`)
            }
            resolved[key] = received[key]
        }
        for (const key of Object.keys(received)) {
            if (!schema.includes(key)) {
                console.warn(`[framework] Unknown prop "${key}"`)
            }
        }
        return resolved
    }

    for (const [key, config] of Object.entries(schema)) {
        const value = received[key]

        if (config.required && value === undefined) {
            console.error(`[framework] Required prop "${key}" is missing`)
        }

        if (value !== undefined && config.type) {
            const expectedType = config.type.name
            const actualType = typeof value

            const typeMap = { String: 'string', Number: 'number', Boolean: 'boolean' }
            if (typeMap[expectedType] && actualType !== typeMap[expectedType]) {
                console.warn(
                    `[framework] Prop "${key}" expected ${expectedType} but got ${actualType}`
                )
            }
        }

        if (value === undefined && config.default !== undefined) {
            resolved[key] = typeof config.default === 'function'
                ? config.default()
                : config.default
        } else {
            resolved[key] = value
        }
    }

    for (const key of Object.keys(received)) {
        if (!(key in schema)) {
            console.warn(`[framework] Unknown prop "${key}"`)
        }
    }

    return resolved
}

export function onMount(fn) {
    if (currentInstance) currentInstance._mountHooks.push(fn)
}

export function onUnmount(fn) {
    if (currentInstance) currentInstance._unmountHooks.push(fn)
}

export function defineComponent(options) {
    return function ComponentFactory(props = {}) {
        const instance = {
            props: options.props ? resolveProps(options.props, props) : props,
            _mountHooks: [],
            _unmountHooks: [],
            _effects: [],
            _element: null,
        }

        currentInstance = instance
        const result = options.setup(instance.props)
        currentInstance = null

        function render(container) {
            instance._element = container

            const { effects } = mountTemplate(
                result.template,
                container,
                result,
                options.components || {}
            )

            instance._effects.push(...effects)

            for (const hook of instance._mountHooks) hook()

            return instance
        }

        function unmount() {
            for (const hook of instance._unmountHooks) hook()
            for (const e of instance._effects) {
                if (typeof e === 'function') {
                    e()
                }
            }
            if (instance._element) instance._element.innerHTML = ''
        }

        return { render, unmount, instance }
    }
}

function mountTemplate(template, container, context, components) {
    const effects = []

    let processed = template.replace(/\s:([a-zA-Z][a-zA-Z0-9-]*)=/g, ' data-bind-$1=')
    
    for (const name of Object.keys(components)) {
        const re = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g')
        processed = processed.replace(re, `<div data-component="${name}"></div>`)
    }

    container.innerHTML = processed

    processTextNodes(container, context, effects)
    processAttrBindings(container, context, effects)
    bindEvents(container, context)
    bindComponents(container, components)

    return { effects }
}

const MUSTACHE_RE = /\{\{\s*(\w+)\s*\}\}/

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
                    const val = context[key]
                    reactiveNode.textContent = String(
                        typeof val === 'function' ? val() : val ?? ''
                    )
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
                    const val = context[expr]
                    const resolved = typeof val === 'function' ? val() : val ?? ''

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
                            const val = context[part.key]
                            result += String(typeof val === 'function' ? val() : val ?? '')
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

// ─── XSS PROTECTION ──────────────────────────────────────────────────────────

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

function parseInterpolation(str) {
    const parts = []
    const regex = /\{\{\s*(\w+)\s*\}\}/g
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

function bindComponents(container, components) {
    const placeholders = container.querySelectorAll('[data-component]')
    for (const placeholder of placeholders) {
        const name = placeholder.dataset.component
        const ComponentFn = components[name]
        if (ComponentFn) {
            const props = {}
            for (const attr of [...placeholder.attributes]) {
                if (attr.name.startsWith('data-prop-')) {
                    props[attr.name.slice(10)] = attr.value
                }
            }
            const child = ComponentFn(props)
            child.render(placeholder)
        }
    }
}
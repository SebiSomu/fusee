import { effect, setEffectHook, batch } from './signal.js'

let currentInstance = null

setEffectHook(eff => {
    if (currentInstance) currentInstance._effects.push(eff)
})

function resolveProps(schema, received) {
    const isArray = Array.isArray(schema)
    const resolved = {}

    const normalizedSchema = {}
    for (const key of Object.keys(isArray ? {} : schema)) {
        normalizedSchema[key.toLowerCase()] = key
    }
    if (isArray) schema.forEach(k => normalizedSchema[k.toLowerCase()] = k)

    for (const [receivedKey, value] of Object.entries(received)) {
        const schemaKey = isArray 
            ? schema.find(k => k.toLowerCase() === receivedKey.toLowerCase())
            : normalizedSchema[receivedKey.toLowerCase()]

        if (schemaKey) {
            const descriptor = Object.getOwnPropertyDescriptor(received, receivedKey)
            if (descriptor && (descriptor.get || descriptor.set)) {
                Object.defineProperty(resolved, schemaKey, descriptor)
            } else {
                resolved[schemaKey] = value
            }
        } else {
            console.warn(`[framework] Unknown prop "${receivedKey}"`)
        }
    }

    // Checking defaults/required for object schema
    if (!isArray) {
        for (const [key, config] of Object.entries(schema)) {
            if (resolved[key] === undefined) {
                if (config.required) {
                    console.error(`[framework] Required prop "${key}" is missing`)
                }
                if (config.default !== undefined) {
                    resolved[key] = typeof config.default === 'function'
                        ? config.default()
                        : config.default
                }
            } else if (config.type) {
                const expectedType = config.type.name
                const actualType = typeof resolved[key]
                const typeMap = { String: 'string', Number: 'number', Boolean: 'boolean' }
                if (typeMap[expectedType] && actualType !== typeMap[expectedType]) {
                    console.warn(`[framework] Prop "${key}" expected ${expectedType} but got ${actualType}`)
                }
            }
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

    // Convert :attr="expr" -> data-bind-attr="expr" only INSIDE tags
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

    processTextNodes(container, context, effects)
    processAttrBindings(container, context, effects)
    bindEvents(container, context)
    bindComponents(container, components, context)

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

function bindComponents(container, components, context) {
    const placeholders = container.querySelectorAll('[data-component]')
    for (const placeholder of placeholders) {
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
                            return typeof val === 'function' ? val() : val
                        },
                        enumerable: true
                    })
                }
            }
            const child = ComponentFn(props)
            child.render(placeholder)
        }
    }
}
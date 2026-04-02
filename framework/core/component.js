// ─── Component System ─────────────────────────────────────────────────────────
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

        // ── Template rendering ───────────────────────────────────────────────────
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

        // ── Unmount ──────────────────────────────────────────────────────────────
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
    const placeholderMap = new Map()
    let i = 0

    const processedHTML = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
        if (key in components) {
            return `<div data-component="${key}"></div>`
        }
        const id = `__fx_${i++}__`
        placeholderMap.set(id, key)
        return `<span data-fx-id="${id}"></span>`
    })

    container.innerHTML = processedHTML

    for (const [id, key] of placeholderMap) {
        const span = container.querySelector(`[data-fx-id="${id}"]`)
        if (!span) continue

        const textNode = document.createTextNode('')
        span.replaceWith(textNode)

        const e = effect(() => {
            const val = context[key]
            textNode.textContent = String(
                typeof val === 'function' ? val() : val ?? ''
            )
        })

        effects.push(e)
    }

    bindEvents(container, context)
    bindComponents(container, components)

    return { effects }
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
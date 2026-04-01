// ─── Component System ─────────────────────────────────────────────────────────
import { effect } from './signal.js'

// Lifecycle context — set while setup() runs
let currentInstance = null

function resolveProps(schema, received) {
    // Schema can be simple array ['title', 'count']
    // or object { title: { type: String, default: 'Untitled', required: false } }
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

    // Object style with type/default/required
    for (const [key, config] of Object.entries(schema)) {
        const value = received[key]

        // Required check
        if (config.required && value === undefined) {
            console.error(`[framework] Required prop "${key}" is missing`)
        }

        // Type check
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

        // Apply default if prop is missing
        if (value === undefined && config.default !== undefined) {
            resolved[key] = typeof config.default === 'function'
                ? config.default()   // default factory (for objects/arrays)
                : config.default
        } else {
            resolved[key] = value
        }
    }

    // Warn for unknown props
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

        // Run setup() with lifecycle context active
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
            // Clean up all reactive effects
            for (const e of instance._effects) {
                for (const dep of e.deps) dep.delete(e)
                e.deps.clear()
            }
            if (instance._element) instance._element.innerHTML = ''
        }

        return { render, unmount, instance }
    }
}

// ── Mount template ────────────────────────────────────────────────────────────
// Parse template ONCE, build static DOM,
// and bind each {{ expr }} directly to a reactive TextNode via effect().
// No more innerHTML after mounting — only textNode.textContent updates.
function mountTemplate(template, container, context, components) {
    const effects = []
    const placeholderMap = new Map()  // id → key from context
    let i = 0

    // Step 1: replace {{ expr }} with unique span placeholders
    const processedHTML = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
        if (key in components) {
            // Nested component — div placeholder as before
            return `<div data-component="${key}"></div>`
        }
        // Signal or value — span with unique id
        const id = `__fx_${i++}__`
        placeholderMap.set(id, key)
        return `<span data-fx-id="${id}"></span>`
    })

    // Step 2: set innerHTML ONCE — only static structure
    container.innerHTML = processedHTML

    // Step 3: for each placeholder, replace span with a TextNode
    // and bind it to signal via effect — only it updates from now
    for (const [id, key] of placeholderMap) {
        const span = container.querySelector(`[data-fx-id="${id}"]`)
        if (!span) continue

        const textNode = document.createTextNode('')
        span.replaceWith(textNode)

        // Effect bound directly to TextNode — signal changes → only textContent update
        const e = effect(() => {
            const val = context[key]
            textNode.textContent = String(
                typeof val === 'function' ? val() : val ?? ''
            )
        })

        effects.push(e)
    }

    // Step 4: bind events ONCE — DOM no longer destroyed,
    bindEvents(container, context)

    // Step 5: mount child components ONCE
    bindComponents(container, components)

    return { effects }
}

// ── Event binding ─────────────────────────────────────────────────────────────
// Called ONCE at mounting — no more re-bind needed
// because DOM is no longer destroyed on each signal update.
function bindEvents(container, context) {
    const all = container.querySelectorAll('*')
    for (const el of all) {
        for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('@')) {
                const eventName = attr.name.slice(1)    // @click → click
                const handlerName = attr.value           // "increment"
                const handler = context[handlerName]
                if (typeof handler === 'function') {
                    el.removeAttribute(attr.name)
                    el.addEventListener(eventName, handler)
                }
            }
        }
    }
}

// ── Nested component mounting ─────────────────────────────────────────────────
// Called ONCE at mounting — children no longer remount
// on each parent update.
function bindComponents(container, components) {
    const placeholders = container.querySelectorAll('[data-component]')
    for (const placeholder of placeholders) {
        const name = placeholder.dataset.component
        const ComponentFn = components[name]
        if (ComponentFn) {
            // Read props from data-prop-* attributes if present
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
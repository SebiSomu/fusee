import { effect, setEffectHook, batch } from './signal.js'
import { mountTemplate } from './compiler.js'

let currentInstance = null

setEffectHook(eff => {
    if (currentInstance) currentInstance._effects.push(eff)
})

function resolveProps(schema, received) {
    const isArray = Array.isArray(schema)
    const resolved = {}

    const normalizedSchema = {}
    if (isArray) {
        schema.forEach(k => normalizedSchema[k.toLowerCase()] = k)
    } else {
        for (const key of Object.keys(schema)) {
            normalizedSchema[key.toLowerCase()] = key
        }
    }

    for (const receivedKey of Object.keys(received)) {
        const schemaKey = isArray
            ? schema.find(k => k.toLowerCase() === receivedKey.toLowerCase())
            : normalizedSchema[receivedKey.toLowerCase()]

        if (!schemaKey) {
            console.warn(`[framework] Unknown prop "${receivedKey}"`)
            continue
        }

        const descriptor = Object.getOwnPropertyDescriptor(received, receivedKey)
        if (descriptor && descriptor.get) {
            Object.defineProperty(resolved, schemaKey, {
                get: descriptor.get,
                enumerable: true,
                configurable: true
            })
        } else {
            resolved[schemaKey] = received[receivedKey]
        }
    }

    if (!isArray) {
        for (const [key, config] of Object.entries(schema)) {
            if (!(key in resolved)) {
                if (config.required) {
                    console.error(`[framework] Required prop "${key}" is missing`)
                }
                if (config.default !== undefined) {
                    resolved[key] = typeof config.default === 'function'
                        ? config.default()
                        : config.default
                }
            } else if (config.type) {
                const value = resolved[key]
                const expectedType = config.type.name
                const actualType = typeof value
                const typeMap = { String: 'string', Number: 'number', Boolean: 'boolean' }
                if (typeMap[expectedType] && actualType !== typeMap[expectedType]) {
                    console.warn(`[framework] Prop "${key}" expected ${expectedType} but got ${actualType}`)
                }
            }
        }
    }

    return resolved
}

// ── Emit ──────────────────────────────────────────────────────────────────────
// listeners: { change: fn, submit: fn, ... }
// emit('change', 42) → calls listeners.change(42)
function createEmit(listeners) {
    return function emit(eventName, ...args) {
        const handler = listeners[eventName]
        if (typeof handler === 'function') {
            batch(() => handler(...args))
        } else if (handler !== undefined) {
            console.warn(`[framework] emit("${eventName}"): listener is not a function`)
        }
    }
}

// ── Slots ─────────────────────────────────────────────────────────────────────
// Parses slot content from parent HTML string.
// Named slots: <template slot="header">...</template>
// Default slot: everything else
export function parseSlots(slotHTML) {
    const slots = { default: '' }
    if (!slotHTML || !slotHTML.trim()) return slots

    const namedSlotRe = /<template\s+slot="([^"]+)"[^>]*>([\s\S]*?)<\/template>/gi
    let remaining = slotHTML
    let match

    while ((match = namedSlotRe.exec(slotHTML)) !== null) {
        slots[match[1]] = match[2].trim()
        remaining = remaining.replace(match[0], '')
    }

    const defaultContent = remaining.trim()
    if (defaultContent) slots.default = defaultContent

    return slots
}

// Replaces <slot> and <slot name="x"> in template with actual slot content
function resolveSlots(template, slots) {
    // Handle named slots with any content between tags (including default content)
    let result = template.replace(/<slot\s+name="([^"]+)"\s*>[\s\S]*?<\/slot>/gi, (match, name) => {
        return slots[name] ?? ''
    })
    // Handle default slots with any content between tags
    result = result.replace(/<slot\s*>[\s\S]*?<\/slot>/gi, () => {
        return slots.default ?? ''
    })
    // Handle self-closing named slots
    result = result.replace(/<slot\s+name="([^"]+)"\s*\/>/gi, (_, name) => slots[name] ?? '')
    // Handle self-closing default slots
    result = result.replace(/<slot\s*\/>/gi, () => slots.default ?? '')
    return result
}

export function onMount(fn) {
    if (currentInstance) currentInstance._mountHooks.push(fn)
}

export function onUnmount(fn) {
    if (currentInstance) currentInstance._unmountHooks.push(fn)
}

export function defineComponent(options) {
    // ComponentFactory now accepts props + optional { listeners, slots }
    // listeners: event handlers from parent @eventName="handler"
    // slots: parsed slot HTML from parent
    return function ComponentFactory(props = {}, { listeners = {}, slots = {} } = {}) {
        const instance = {
            props: options.props ? resolveProps(options.props, props) : props,
            _mountHooks: [],
            _unmountHooks: [],
            _effects: [],
            _element: null,
        }

        const emit = createEmit(listeners)

        currentInstance = instance
        // setup() receives (props, { emit, slots })
        const result = options.setup(instance.props, { emit, slots })
        currentInstance = null

        function render(container) {
            instance._element = container

            // Resolve slot placeholders before mounting
            const resolvedTemplate = resolveSlots(result.template, slots)

            const { effects } = mountTemplate(
                resolvedTemplate,
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
                if (typeof e === 'function') e()
            }
            if (instance._element) instance._element.innerHTML = ''
        }

        return { render, unmount, instance }
    }
}
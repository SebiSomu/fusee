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
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
                if (typeof e === 'function') e()
            }
            if (instance._element) instance._element.innerHTML = ''
        }

        return { render, unmount, instance }
    }
}
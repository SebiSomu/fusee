import { effect, setEffectHook, batch } from './signal.js'
import { mountTemplate } from './compiler.js'
import { inject as diInject, rootInjector, runInContext, replaceActiveInjector, EnvironmentInjector } from './di.js'

let currentInstance = null

setEffectHook(eff => {
    if (currentInstance) currentInstance._effects.push(eff)
})

/** Returns the component instance currently running setup or a lifecycle hook. */
export function getCurrentInstance() {
    return currentInstance
}

/** Sets the active component instance for framework internals and composables. */
export function setCurrentInstance(instance) {
    currentInstance = instance
}

// Global accessor hook for di.js execution context guard
globalThis.__FUSEE_GET_CURRENT_INSTANCE__ = getCurrentInstance

/** 
 * Resolves received props against a declared schema, validating types, 
 * filling in default values, and checking for missing required props. 
 */
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

/** Creates a batched event emitter that safely dispatches payloads to component listeners. */
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

/** Parses named template slots and returns their content grouped by slot name. */
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

/** Replaces slot outlets in a component template with supplied slot content. */
function resolveSlots(template, slots) {
    let result = template.replace(/<slot\s+name="([^"]+)"\s*>[\s\S]*?<\/slot>/gi, (match, name) => {
        return slots[name] ?? ''
    })
    result = result.replace(/<slot\s*>[\s\S]*?<\/slot>/gi, () => {
        return slots.default ?? ''
    })

    result = result.replace(/<slot\s+name="([^"]+)"\s*\/>/gi, (_, name) => slots[name] ?? '')
    result = result.replace(/<slot\s*\/>/gi, () => slots.default ?? '')
    return result
}

/** Registers a callback to run after the component has rendered. */
export function onMount(fn) {
    if (currentInstance) currentInstance._mountHooks.push(fn)
}

/** Registers a callback to run when the component is unmounted. */
export function onUnmount(fn) {
    if (currentInstance) currentInstance._unmountHooks.push(fn)
}

/** Creates a component factory with setup, rendering, props, slots, and lifecycle state. */
export function defineComponent(options) {
    return function ComponentFactory(props = {}, { listeners = {}, slots = {}, parent = null } = {}) {
        const effectiveParent = parent || currentInstance

        const parentInjector = (effectiveParent && effectiveParent._injector) || rootInjector
        const parentProvides = effectiveParent ? (effectiveParent.provides || effectiveParent._provides || null) : null
        const parentApp = effectiveParent ? (effectiveParent._app || (effectiveParent._provides ? effectiveParent : null)) : (options._app || null)
        const parentComponents = effectiveParent ? (effectiveParent._components || effectiveParent.components || null) : (parentApp ? (parentApp._components || parentApp.components || null) : {})

        const rawMergedComponents = {
            ...(parentComponents || {}),
            ...(options.components || {})
        }

        const mergedComponents = new Proxy(rawMergedComponents, {
            get(target, prop, receiver) {
                if (typeof prop !== 'string') return Reflect.get(target, prop, receiver)
                if (prop in target) return target[prop]
                const lower = prop.toLowerCase()
                for (const key of Object.keys(target)) {
                    if (key.toLowerCase() === lower) {
                        return target[key]
                    }
                }
                return undefined
            },
            has(target, prop) {
                if (typeof prop !== 'string') return Reflect.has(target, prop)
                if (prop in target) return true
                const lower = prop.toLowerCase()
                for (const key of Object.keys(target)) {
                    if (key.toLowerCase() === lower) return true
                }
                return false
            }
        })

        const instance = {
            props: options.props ? resolveProps(options.props, props) : props,
            _mountHooks: [],
            _unmountHooks: [],
            _effects: [],
            _element: null,
            _parent: effectiveParent,
            _app: parentApp,
            _components: mergedComponents,
            provides: parentProvides ? Object.create(parentProvides) : Object.create(null),
            _injector: parentInjector,
            _ownsInjector: false
        }

        const emit = createEmit(listeners)

        const previousInstance = currentInstance
        currentInstance = instance
        let result
        try {
            result = runInContext(instance._injector, () => {
                return options.setup ? options.setup(instance.props, { emit, slots }) : {}
            })
            instance.state = result
            if (result && typeof result === 'object') {
                result._instance = instance
            }
        } finally {
            currentInstance = previousInstance
        }

        function render(container) {
            const prevInstance = currentInstance
            currentInstance = instance
            try {
                instance._element = container

                if (options.render) {
                    const nodes = options.render(result, mergedComponents)
                    container.innerHTML = ''
                    
                    function mountNode(fnode) {
                        if (!fnode || !fnode.node) return
                        container.appendChild(fnode.node)
                        
                        if (fnode.effects) {
                            instance._effects.push(...fnode.effects)
                        }
                        
                        if (fnode.children) {
                            for (const child of fnode.children) {
                                mountNode(child)
                            }
                        }
                    }
                    
                    for (const node of nodes) {
                        mountNode(node)
                    }
                } else {
                    const resolvedTemplate = resolveSlots(result?.template || '', slots)
                    const { effects } = mountTemplate(
                        resolvedTemplate,
                        container,
                        result,
                        mergedComponents
                    )
                    instance._effects.push(...effects)
                }

                for (const hook of instance._mountHooks) 
                    hook()

                return instance
            } finally {
                currentInstance = prevInstance
            }
        }

        function unmount() {
            for (const hook of instance._unmountHooks) hook()
            const effects = instance._effects
            for (let i = effects.length - 1; i >= 0; i--) {
                const cleanup = effects[i]
                if (typeof cleanup === 'function') cleanup()
            }
            instance._effects = []
            if (instance._element) {
                instance._element.innerHTML = ''
            }
        }

        return { render, unmount, instance }
    }
}

/** Provides a value or dependency injection configuration down to descendant components. */
export function provide(key, value) {
    if (!currentInstance) return

    const provideKey = (key && typeof key === 'object' && key.provide) ? key.provide : key
    currentInstance.provides[provideKey] = value

    if (!currentInstance._ownsInjector) {
        currentInstance._injector = new EnvironmentInjector([], currentInstance._injector)
        currentInstance._ownsInjector = true
        replaceActiveInjector(currentInstance._injector)
    }
    
    if (value === undefined && key && key.provide) {
        currentInstance._injector.provide(key)
    } else if (value && typeof value === 'object' && (value.useClass || value.useFactory || value.useExisting)) {
        currentInstance._injector.provide({ provide: key, ...value })
    } else {
        currentInstance._injector.provide({ provide: key, useValue: value })
    }
}

/** Defines an asynchronous component wrapper that handles lazy loading, placeholders, and error states. */
export function defineAsyncComponent(loaderOrOptions) {
    const options = typeof loaderOrOptions === 'function'
        ? { loader: loaderOrOptions }
        : loaderOrOptions

    return function AsyncComponentFactory(props = {}, { listeners = {}, slots = {}, parent = null } = {}) {
        const effectiveParent = parent || currentInstance
        const parentInjector = (effectiveParent && effectiveParent._injector) || rootInjector
        const parentProvides = effectiveParent
            ? (effectiveParent.provides || effectiveParent._provides || null)
            : null
        const parentApp = effectiveParent ? effectiveParent._app : null
        const parentComponents = effectiveParent ? effectiveParent._components : (parentApp ? parentApp._components : {})

        const instance = {
            props,
            _mountHooks: [],
            _unmountHooks: [],
            _effects: [],
            _element: null,
            _parent: effectiveParent,
            _app: parentApp,
            _components: parentComponents,
            provides: parentProvides ? Object.create(parentProvides) : Object.create(null),
            _injector: parentInjector,
            _ownsInjector: false
        }

        let childApi = null
        let loadingApi = null
        let isUnmounted = false

        function render(container) {
            const prevInstance = currentInstance
            currentInstance = instance
            try {
                instance._element = container

                if (options.loadingComponent) {
                    loadingApi = options.loadingComponent({}, { parent: instance })
                    loadingApi.render(container)
                } else {
                    container.innerHTML = '<!-- async component boundary -->'
                }

                Promise.resolve(options.loader())
                    .then(comp => {
                        if (isUnmounted) return
                        let ComponentFn = comp.default || comp

                        if (typeof ComponentFn === 'object' && ComponentFn !== null) {
                            ComponentFn = Object.values(ComponentFn).find(v => typeof v === 'function') || ComponentFn
                        }

                        if (loadingApi) {
                            loadingApi.unmount()
                            loadingApi = null
                        }

                        childApi = ComponentFn(props, { listeners, slots, parent: instance })

                        container.innerHTML = ''
                        childApi.render(container)
                    })
                    .catch(err => {
                        console.error('[framework] Failed to load async component:', err)
                    })

                return instance
            } finally {
                currentInstance = prevInstance
            }
        }

        function unmount() {
            isUnmounted = true
            if (loadingApi) loadingApi.unmount()
            if (childApi) childApi.unmount()
            if (instance._element && !childApi && !loadingApi) {
                instance._element.innerHTML = ''
            }
        }

        return { render, unmount, instance }
    }
}

/** Resolves and injects a provided value or dependency from the current component's provider tree or global injector. */
export function inject(key, defaultValue, options) {
    const instance = getCurrentInstance()

    let actualOptions = undefined
    let actualDefaultValue = undefined

    if (defaultValue && typeof defaultValue === 'object' && 
        ('optional' in defaultValue || 'skipSelf' in defaultValue || 'self' in defaultValue)) {
        actualOptions = defaultValue
    } else {
        actualDefaultValue = defaultValue
        if (options && typeof options === 'object') {
            actualOptions = options
        }
    }

    if (instance && instance.provides && key in instance.provides) {
        const val = instance.provides[key]
        const isTokenProvider = key && typeof key === 'object' && key.provide
        if (val !== undefined || !isTokenProvider) {
            if (val && typeof val === 'object' && ('useClass' in val || 'useFactory' in val || 'useExisting' in val)) {
                return instance._injector.get(key, actualOptions)
            }
            if (val && typeof val === 'object' && 'useValue' in val) {
                return val.useValue
            }
            return val
        }
    }

    try {
        return diInject(key, actualOptions !== undefined ? actualOptions : actualDefaultValue)
    } catch (err) {
        if (actualDefaultValue !== undefined) {
            return actualDefaultValue
        }
        throw err
    }
}
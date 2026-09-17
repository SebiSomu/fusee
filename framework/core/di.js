/** Represents a unique token used for dependency injection when standard classes or strings are insufficient. */
export class InjectionToken {
    constructor(description) {
        this.description = description
    }
    toString() {
        return `Token ${this.description}`
    }
}

export function isClass(fn) {
    return typeof fn === 'function' && /^class\s/.test(Function.prototype.toString.call(fn))
}

/** Abstract base class defining the standard interface for dependency injectors. */
export class Injector {
    get(token, options = {}) {
        throw new Error('Abstract method get() must be implemented.')
    }
}

/** Terminal injector fallback that throws an error or returns null when a provider cannot be found. */
export class NullInjector extends Injector {
    get(token, options = {}) {
        if (options && options.optional) {
            return null
        }
        const tokenName = token?.name || token?.description || String(token)
        throw new Error(`NullInjectorError: No provider found for ${tokenName}`)
    }
}

/** Hierarchical injector that manages provider records, cached instances, and dependency resolution. */
export class EnvironmentInjector extends Injector {
    /** Initializes the environment injector with a list of providers and an optional parent injector. */
    constructor(providers = [], parent = new NullInjector()) {
        super()
        this.parent = parent
        this.records = new Map()
        this.instances = new Map()
        this.resolutionStack = new Set()

        for (const provider of providers) {
            this.provide(provider)
        }
    }

    /** Registers a class, value, factory, or existing provider definition into the injector records. */
    provide(provider) {
        let token
        let record

        if (typeof provider === 'function') {
            token = provider
            record = { useClass: provider }
        } else if (provider && typeof provider === 'object' && provider.provide) {
            token = provider.provide
            record = provider
        } else {
            throw new Error('Invalid provider definition.')
        }

        this.records.set(token, record)
    }

    /** Resolves and returns the instance or value associated with the specified token. */
    get(token, options = {}) {
        if (options.skipSelf) {
            return this.parent ? this.parent.get(token, { ...options, skipSelf: false }) : null
        }

        if (this.instances.has(token)) {
            return this.instances.get(token)
        }

        if (this.records.has(token)) {
            if (this.resolutionStack.has(token)) {
                const path = [...Array.from(this.resolutionStack).map(t => t.name || t.description || String(t)), token.name || token.description || String(token)].join(' -> ')
                throw new Error(`Circular dependency detected: ${path}`)
            }

            this.resolutionStack.add(token)
            try {
                const record = this.records.get(token)
                let instance

                if ('useValue' in record) {
                    instance = record.useValue
                } else if ('useClass' in record) {
                    instance = runInContext(this, () => new record.useClass())
                } else if ('useFactory' in record) {
                    instance = runInContext(this, () => record.useFactory())
                } else if ('useExisting' in record) {
                    instance = this.get(record.useExisting, options)
                }

                this.instances.set(token, instance)
                return instance
            } finally {
                this.resolutionStack.delete(token)
            }
        }

        if (options.self) {
            if (options.optional) return null
            const tokenName = token?.name || token?.description || String(token)
            throw new Error(`NullInjectorError: No provider found for ${tokenName} locally`)
        }

        return this.parent.get(token, options)
    }

    /** Creates and returns a child environment injector that inherits from this injector. */
    createChild(providers = []) {
        return new EnvironmentInjector(providers, this)
    }

    /** Destroys cached instances by invoking cleanup hooks and clears all records and instances. */
    destroy() {
        for (const instance of this.instances.values()) {
            if (instance && typeof instance.destroy === 'function') {
                instance.destroy()
            } else if (instance && typeof instance.onDestroy === 'function') {
                instance.onDestroy()
            }
        }
        this.instances.clear()
        this.records.clear()
    }
}

/** Global root instance of EnvironmentInjector used for application-wide dependencies. */
export const rootInjector = new EnvironmentInjector()

/** Registers a provider globally in the root application injector. */
export function provideGlobal(provider) {
    rootInjector.provide(provider)
}

let activeInjector = null

/** Executes a callback function within the context of a specified active injector. */
export function runInContext(injector, fn) {
    const prev = activeInjector
    activeInjector = injector
    try {
        return fn()
    } finally {
        activeInjector = prev
    }
}

/** Replaces the currently active injector with a new one and returns the previous active injector. */
export function replaceActiveInjector(injector) {
    const prev = activeInjector
    activeInjector = injector
    return prev
}

/** Safely retrieves the active component instance from the global scope if available. */
function getActiveComponentInstance() {
    if (typeof globalThis.__FUSEE_GET_CURRENT_INSTANCE__ === 'function') {
        return globalThis.__FUSEE_GET_CURRENT_INSTANCE__()
    }
    return null
}

/** Resolves a dependency token using the current component context or active injector. */
export function inject(token, defaultValueOrOptions, treatDefaultAsFactory = false) {
    const currentInstance = getActiveComponentInstance()

    if (!currentInstance && !activeInjector) {
        throw new Error('inject() called outside of an injection context')
    }

    let isOptionsObj = false
    let options = {}
    let hasDefault = false
    let defaultValue = undefined

    if (defaultValueOrOptions !== undefined) {
        if (typeof defaultValueOrOptions === 'object' && defaultValueOrOptions !== null &&
            ('optional' in defaultValueOrOptions || 'skipSelf' in defaultValueOrOptions || 'self' in defaultValueOrOptions)) {
            isOptionsObj = true
            options = defaultValueOrOptions
        } else {
            hasDefault = true
            defaultValue = defaultValueOrOptions
        }
    }

    if (isOptionsObj && options.skipSelf && options.self) {
        throw new Error('Cannot combine both skipSelf and self')
    }

    if (currentInstance) {
        let targetProvides = currentInstance.provides

        if (options.skipSelf && targetProvides) {
            targetProvides = Object.getPrototypeOf(targetProvides)
        }

        if (options.self && currentInstance.provides) {
            if (Object.prototype.hasOwnProperty.call(currentInstance.provides, token)) {
                return currentInstance.provides[token]
            }
            if (options.optional) return null
            const tokenName = token?.name || token?.description || String(token)
            throw new Error(`NullInjectorError: No provider found for ${tokenName} locally`)
        }

        if (targetProvides && token in targetProvides) {
            const val = targetProvides[token]

            if (val && typeof val === 'object' && ('useValue' in val || 'useClass' in val || 'useFactory' in val || 'useExisting' in val)) {
                if ('useValue' in val) return val.useValue
                if ('useClass' in val) return new val.useClass()
                if ('useFactory' in val) return val.useFactory()
                if ('useExisting' in val) return inject(val.useExisting, defaultValueOrOptions, treatDefaultAsFactory)
            }

            return val
        }
    }

    const injector = activeInjector || (currentInstance ? currentInstance._injector : rootInjector)

    try {
        return injector.get(token, options)
    } catch (err) {
        if (hasDefault) {
            return treatDefaultAsFactory && typeof defaultValue === 'function' 
                ? defaultValue() 
                : defaultValue
        }
        if (options.optional && err.message && err.message.includes('NullInjectorError')) {
            return null
        }
        throw err
    }
}
import { getCurrentInstance } from './component.js';

export class InjectionToken {
    /** Creates a distinct dependency token with a readable diagnostic description. */
    constructor(description) {
        this.description = description;
    }
    /** Returns the token's diagnostic label. */
    toString() {
        return `InjectionToken ${this.description}`;
    }
}

/** Reports whether a value can be used as a constructable class provider. */
export function isClass(fn) {
    if (typeof fn !== 'function') return false;
    const str = fn.toString();
    if (/^\s*class\s+/.test(str)) return true;
    return fn.prototype !== undefined && 
           fn.prototype.constructor === fn && 
           Object.getOwnPropertyNames(fn.prototype).length > 1;
}

export class Injector {
    /** Defines the lookup contract implemented by concrete injectors. */
    get(token, options = { optional: false }) {
        throw new Error('Not implemented');
    }
}

export class NullInjector extends Injector {
    /** Returns null for optional lookups or throws a missing-provider error. */
    get(token, options = { optional: false }) {
        if (options.optional) {
            return null;
        }
        const tokenName = token?.name || token?.description || token;
        throw new Error(`NullInjectorError: No provider for ${tokenName}!`);
    }
}

const NULL_INJECTOR = new NullInjector();

export class EnvironmentInjector extends Injector {
    /** Creates a hierarchical injector and normalizes its initial providers. */
    constructor(providers = [], parent = NULL_INJECTOR) {
        super();
        this.parent = parent;
        this.records = new Map(); 
        this.instances = new Map(); 
        this.resolutionStack = new Set(); 
        this._normalizeProviders(providers);
    }

    /** Converts shorthand classes and provider records into lookup records. */
    _normalizeProviders(providers) {
        for (const provider of providers) {
            if (typeof provider === 'function' && isClass(provider)) {
                this.records.set(provider, { useClass: provider });
            } else if (provider && provider.provide) {
                this.records.set(provider.provide, provider);
            } else {
                throw new Error(`Invalid provider configuration: ${provider}`);
            }
        }
    }

    /** Adds one provider to this injector. */
    provide(provider) {
        this._normalizeProviders([provider]);
    }

    /** Resolves a cached, local, or parent-provided dependency. */
    get(token, options = { optional: false }) {
        if (this.instances.has(token)) {
            return this.instances.get(token);
        }

        if (this.records.has(token)) {
            if (this.resolutionStack.has(token)) {
                const path = [...this.resolutionStack, token]
                    .map(t => t?.name || t?.description || t)
                    .join(' -> ');
                throw new Error(`Circular dependency detected: ${path}`);
            }

            this.resolutionStack.add(token);

            try {
                const record = this.records.get(token);
                const instance = this._instantiate(record);
                this.instances.set(token, instance);
                return instance;
            } finally {
                this.resolutionStack.delete(token);
            }
        }

        if (options.self === true) {
            if (options.optional === true) {
                return null;
            }
            const tokenName = token?.name || token?.description || token;
            throw new Error(`NullInjectorError: No provider found for ${tokenName} locally (self: true)`);
        }

        return this.parent.get(token, options);
    }

    /** Instantiates a provider record inside this injector's active context. */
    _instantiate(record) {
        return runInContext(this, () => {
            if (record.useValue !== undefined) {
                return record.useValue;
            }
            if (record.useFactory) {
                return record.useFactory();
            }
            if (record.useExisting) {
                return inject(record.useExisting);
            }
            if (record.useClass) {
                const ClassDef = record.useClass;
                return new ClassDef();
            }
            throw new Error(`Invalid provider record configuration for ${record.provide?.name || record.provide}`);
        });
    }

    /** Creates a child injector that falls back to this injector. */
    createChild(providers = []) {
        return new EnvironmentInjector(providers, this);
    }

    /** Calls lifecycle cleanup hooks and releases this injector's records. */
    destroy() {
        for (const instance of this.instances.values()) {
            if (instance && typeof instance.destroy === 'function') {
                try {
                    instance.destroy();
                } catch (e) {
                    console.error('Error during instance destroy:', e);
                }
            } else if (instance && typeof instance.onDestroy === 'function') {
                try {
                    instance.onDestroy();
                } catch (e) {
                    console.error('Error during instance onDestroy:', e);
                }
            }
        }
        this.instances.clear();
        this.records.clear();
    }
}

let _activeInjector = null;

/** Runs a callback with the supplied injector as the active lookup context. */
export function runInContext(injector, fn) {
    const previousInjector = _activeInjector;
    _activeInjector = injector;
    try {
        return fn();
    } finally {
        _activeInjector = previousInjector;
    }
}

/** Replaces the active injector for integrations that manage context themselves. */
export function replaceActiveInjector(injector) {
    _activeInjector = injector;
}

/** 
 * Resolves a dependency from instance.provides or the active DI injector.
 * Supports default values and optional factory evaluation.
 */
export function inject(token, defaultValueOrOptions, treatDefaultAsFactory = false) {
    const instance = getCurrentInstance();
    if (instance && instance.provides && token in instance.provides) {
        return instance.provides[token];
    }

    const isOptionsObject = 
        defaultValueOrOptions && 
        typeof defaultValueOrOptions === 'object' && 
        ('optional' in defaultValueOrOptions || 'skipSelf' in defaultValueOrOptions || 'self' in defaultValueOrOptions);

    const options = isOptionsObject ? defaultValueOrOptions : {};
    const hasDefaultValue = !isOptionsObject && defaultValueOrOptions !== undefined;

    if (_activeInjector !== null) {
        const isOptional = options.optional === true || hasDefaultValue;
        const skipSelf = options.skipSelf === true;
        const self = options.self === true;

        if (skipSelf && self) {
            throw new Error('Cannot combine both skipSelf and self InjectOptions');
        }

        const injectorToUse = skipSelf ? _activeInjector.parent : _activeInjector;

        if (injectorToUse) {
            const resolved = injectorToUse.get(token, { ...options, optional: isOptional });
            if (resolved !== null && resolved !== undefined) {
                return resolved;
            }
        }
    }

    if (hasDefaultValue) {
        return (treatDefaultAsFactory && typeof defaultValueOrOptions === 'function')
            ? defaultValueOrOptions()
            : defaultValueOrOptions;
    }

    if (options.optional) {
        return null;
    }

    throw new Error(`NullInjectorError: No provider found for ${token?.name || token?.description || token}`);
}

export const rootInjector = new EnvironmentInjector();

/** Registers a provider on the process-wide root injector. */
export function provideGlobal(provider) {
    rootInjector.provide(provider);
}
export class InjectionToken {
    constructor(description) {
        this.description = description;
    }
    toString() {
        return `InjectionToken ${this.description}`;
    }
}

export function isClass(fn) {
    if (typeof fn !== 'function') return false;
    const str = fn.toString();
    if (/^\s*class\s+/.test(str)) return true;
    return fn.prototype !== undefined && 
           fn.prototype.constructor === fn && 
           Object.getOwnPropertyNames(fn.prototype).length > 1;
}

export class Injector {
    get(token, options = { optional: false }) {
        throw new Error('Not implemented');
    }
}

export class NullInjector extends Injector {
    get(token, options = { optional: false }) {
        if (options.optional) {
            return null;
        }
        const tokenName = token?.name || token?.description || token;
        throw new Error(`NullInjectorError: No provider for ${tokenName}!`);
    }
}

export class EnvironmentInjector extends Injector {
    constructor(providers = [], parent = new NullInjector()) {
        super();
        this.parent = parent;
        this.records = new Map(); 
        this.instances = new Map(); 
        this.resolutionStack = new Set(); 

        this._normalizeProviders(providers);
    }

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

    provide(provider) {
        this._normalizeProviders([provider]);
    }

    // Bubble-up algorithm for resolving hierarchical dependencies
    get(token, options = { optional: false }) {
        if (this.instances.has(token)) {
            return this.instances.get(token);
        }

        if (this.records.has(token)) {
            if (this.resolutionStack.has(token)) {
                const tokenName = token?.name || token?.description || token;
                throw new Error(`Circular dependency detected for ${tokenName}!`);
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

        return this.parent.get(token, options);
    }

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
}

let _activeInjector = null;

export function runInContext(injector, fn) {
    const previousInjector = _activeInjector;
    _activeInjector = injector;
    try {
        return fn();
    } finally {
        _activeInjector = previousInjector;
    }
}

export function inject(token, options = {}) {
    if (_activeInjector === null) {
        throw new Error('inject() called outside of an injection context');
    }

    const isOptional = options.optional === true;
    const skipSelf = options.skipSelf === true;

    const injectorToUse = skipSelf ? _activeInjector.parent : _activeInjector;

    if (!injectorToUse) {
        if (isOptional) return null;
        throw new Error(`No provider found for ${token?.name || token}`);
    }

    try {
        return injectorToUse.get(token, options);
    } catch (error) {
        if (isOptional) {
            return null;
        }
        throw error;
    }
}

export const rootInjector = new EnvironmentInjector();

export function provideGlobal(provider) {
    rootInjector.provide(provider);
}

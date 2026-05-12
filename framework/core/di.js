export class InjectionToken {
    constructor(description) {
        this.description = description;
    }
    toString() {
        return `InjectionToken ${this.description}`;
    }
}

const globalInstances = new Map();
const globalRegistry = new Map();

export function provideGlobal(token, provider) {
    globalRegistry.set(token, provider);
}

export function resolveGlobal(token) {
    if (globalInstances.has(token)) {
        return globalInstances.get(token);
    }

    if (globalRegistry.has(token)) {
        let provider = globalRegistry.get(token);
        let instance;

        if (typeof provider === 'function' && isClass(provider)) {
            instance = new provider(); // class
        } else if (typeof provider === 'function') {
            instance = provider(); // factory function
        } else {
            instance = provider; // value
        }

        globalInstances.set(token, instance);
        return instance;
    }

    if (typeof token === 'function' && isClass(token)) {
        const instance = new token();
        globalInstances.set(token, instance);
        return instance;
    }

    return null;
}

function isClass(fn) {
    return typeof fn === 'function' && 
           /^\s*class\s+/.test(fn.toString()) || 
           (fn.prototype && fn.prototype.constructor === fn && Object.getOwnPropertyNames(fn.prototype).length > 1);
}

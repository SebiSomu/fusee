import { signal } from './signal.js';

/**
 * Serializes the current reactive state object to a JSON string.
 * Extracts raw values from signals.
 */
export function serializeState(stateObj) {
    const serialized = {};
    for (const [k, v] of Object.entries(stateObj)) {
        if (typeof v === 'function' && v.isSignal) {
            serialized[k] = v();
        } else {
            serialized[k] = v;
        }
    }
    return JSON.stringify(serialized);
}

/**
 * Resumes reactivity on the client by rebuilding signals from a serialized state.
 * Returns the populated reactive state object.
 */
export function resume(stateJson, stateSignals = {}) {
    const parsed = typeof stateJson === 'string' ? JSON.parse(stateJson) : stateJson;
    
    for (const [key, value] of Object.entries(parsed)) {
        if (stateSignals[key]) {
            stateSignals[key](value);
        } else {
            stateSignals[key] = signal(value);
        }
    }
    
    return stateSignals;
}

/**
 * Global Qwik-style event loader. Intercepts events at the document level
 * and dynamically loads event handler modules only on user interaction.
 */
export function fuseeLoader(options = {}) {
    const state = options.state || {};
    const events = options.events || ['click', 'input', 'change'];
    
    const handler = async (e, eventName) => {
        const target = e.target.closest(`[f\\:on-${eventName}]`);
        if (!target) return;
        
        const attr = target.getAttribute(`f:on-${eventName}`);
        if (!attr) return;
        
        const [url, symbol] = attr.split('#');
        
        try {
            // Under Node/JSDOM tests, we might need a custom import resolver
            const resolver = options.resolveImport || (async (path) => import(path));
            const module = await resolver(url);
            const fn = module[symbol];
            if (typeof fn === 'function') {
                fn(e, target, state);
            } else {
                console.error(`[fusée-loader] Handler ${symbol} not found in ${url}`);
            }
        } catch (err) {
            console.error(`[fusée-loader] Failed to load handler ${url}`, err);
        }
    };
    
    events.forEach(name => {
        document.addEventListener(name, (e) => handler(e, name), true);
    });
}

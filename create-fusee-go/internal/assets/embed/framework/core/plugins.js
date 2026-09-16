/**
 * Formalizes a Vite/Rollup-compatible plugin system with distinct domain boundaries
 * for compiler transforms, server middleware, devtools, and runtime adapters.
 */

/**
 * Defines a compiler plugin for build-time execution.
 * Integrates directly with Vite/Rollup hook lifecycles.
 */
export function defineCompilerPlugin(def) {
    return {
        __domain: 'compiler',
        name: def.name || 'anonymous-compiler-plugin',
        enforce: def.enforce,
        buildStart: def.buildStart,
        resolveId: def.resolveId,
        load: def.load,
        transform: def.transform,
        generateBundle: def.generateBundle,
        ...def
    };
}

/**
 * Defines a server plugin for dev server and SSR execution.
 */
export function defineServerPlugin(def) {
    return {
        __domain: 'server',
        name: def.name || 'anonymous-server-plugin',
        configureServer: def.configureServer,
        middleware: def.middleware || [],
        ssrHooks: def.ssrHooks || {},
        routeActions: def.routeActions || {},
        manifestExtensions: def.manifestExtensions || {},
        ...def
    };
}

/**
 * Defines a DevTools plugin for developer experience and debugging panels.
 */
export function defineDevToolsPlugin(def) {
    return {
        __domain: 'devtools',
        name: def.name || 'anonymous-devtools-plugin',
        panels: def.panels || [],
        inspectHooks: def.inspectHooks || {},
        stateTracking: def.stateTracking || {},
        ...def
    };
}

/**
 * Defines a runtime adapter for platform-specific capabilities (e.g., DOM vs SSR vs Native).
 */
export function defineRuntimeAdapter(def) {
    return {
        __domain: 'runtime',
        name: def.name || 'anonymous-runtime-adapter',
        ...def
    };
}

/**
 * High-level plugin authoring helper that cleanly isolates and packages 
 * compiler, server, runtime, and devtools sub-plugins into a single unit.
 */
export function defineFuseePlugin(def) {
    if (!def.name) {
        console.warn('[framework] defineFuseePlugin expects a `name` property.');
    }

    return {
        name: def.name,
        compiler: def.compiler ? defineCompilerPlugin({ name: `${def.name}-compiler`, ...def.compiler }) : null,
        server: def.server ? defineServerPlugin({ name: `${def.name}-server`, ...def.server }) : null,
        devtools: def.devtools ? defineDevToolsPlugin({ name: `${def.name}-devtools`, ...def.devtools }) : null,
        runtime: def.runtime ? defineRuntimeAdapter({ name: `${def.name}-runtime`, ...def.runtime }) : null,
    };
}
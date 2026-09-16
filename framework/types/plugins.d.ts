export interface CompilerPluginDef {
    name?: string;
    enforce?: 'pre' | 'post';
    buildStart?: (...args: any[]) => any;
    resolveId?: (...args: any[]) => any;
    load?: (...args: any[]) => any;
    transform?: (...args: any[]) => any;
    generateBundle?: (...args: any[]) => any;
    [key: string]: any;
}

export interface CompilerPlugin extends CompilerPluginDef {
    __domain: 'compiler';
    name: string;
}

export interface ServerPluginDef {
    name?: string;
    configureServer?: (...args: any[]) => any;
    middleware?: (...args: any[]) => any | Array<(...args: any[]) => any>;
    ssrHooks?: Record<string, (...args: any[]) => any>;
    routeActions?: Record<string, (...args: any[]) => any>;
    manifestExtensions?: Record<string, any> | ((...args: any[]) => any);
    [key: string]: any;
}

export interface ServerPlugin extends ServerPluginDef {
    __domain: 'server';
    name: string;
}

export interface DevToolsPluginDef {
    name?: string;
    panels?: any[];
    inspectHooks?: Record<string, (...args: any[]) => any>;
    stateTracking?: Record<string, (...args: any[]) => any>;
    [key: string]: any;
}

export interface DevToolsPlugin extends DevToolsPluginDef {
    __domain: 'devtools';
    name: string;
}

export interface RuntimeAdapterDef {
    name?: string;
    [key: string]: any;
}

export interface RuntimeAdapter extends RuntimeAdapterDef {
    __domain: 'runtime';
    name: string;
}

export interface FuseePluginDef {
    name: string;
    compiler?: Omit<CompilerPluginDef, 'name'>;
    server?: Omit<ServerPluginDef, 'name'>;
    devtools?: Omit<DevToolsPluginDef, 'name'>;
    runtime?: Omit<RuntimeAdapterDef, 'name'>;
}

export interface FuseePlugin {
    name: string;
    compiler: CompilerPlugin | null;
    server: ServerPlugin | null;
    devtools: DevToolsPlugin | null;
    runtime: RuntimeAdapter | null;
}

export function defineCompilerPlugin(def: CompilerPluginDef): CompilerPlugin;
export function defineServerPlugin(def: ServerPluginDef): ServerPlugin;
export function defineDevToolsPlugin(def: DevToolsPluginDef): DevToolsPlugin;
export function defineRuntimeAdapter(def: RuntimeAdapterDef): RuntimeAdapter;
export function defineFuseePlugin(def: FuseePluginDef): FuseePlugin;
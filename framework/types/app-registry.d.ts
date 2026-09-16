export type PluginInstallFunction<Options extends any[] = any[]> = (app: App, ...options: Options) => void;

export interface PluginObject<Options extends any[] = any[]> {
    install: PluginInstallFunction<Options>;
}

export type Plugin<Options extends any[] = any[]> = 
    | PluginObject<Options> 
    | PluginInstallFunction<Options>;

export interface AppConfig {
    globalProperties: Record<string, any>;
}

export class App {
    rootComponent: any;
    rootProps: Record<string, any>;
    config: AppConfig;

    private _installedPlugins: Set<any>;
    private _provides: Record<string | symbol, any>;

    constructor(rootComponent: any, rootProps?: Record<string, any>);

    use<Options extends any[] = any[]>(plugin: Plugin<Options>, ...options: Options): this;
    provide<T = any>(key: string | symbol, value: T): this;
    mount(selector: string | Element): this;
    render(container: Element): void;
}

export function createApp(rootComponent: any, rootProps?: Record<string, any>): App;
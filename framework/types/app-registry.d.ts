import { ComponentFactory, ComponentInstance } from './component';

export type PluginInstallFunction<Options extends any[] = any[]> = (app: App, ...options: Options) => void;

export interface PluginObject<Options extends any[] = any[]> {
    install: PluginInstallFunction<Options>;
}

export type Plugin<Options extends any[] = any[]> = 
    | PluginObject<Options> 
    | PluginInstallFunction<Options>;

export interface AppConfig {
    globalProperties: Record<string, any>;
    errorHandler: ((err: Error) => void) | null;
    warnHandler: ((msg: string) => void) | null;
}

export type AppHook = (app: App) => void;

export class App {
    rootComponent: ComponentFactory<any>;
    rootProps: Record<string, any>;
    config: AppConfig;

    private _installedPlugins: Set<any>;
    private _provides: Record<string | symbol, any>;
    private _components: Record<string, ComponentFactory<any>>;
    private _directives: Record<string, any>;
    private _hooks: Record<string, AppHook[]>;
    private _rootInstance: { render: Function; unmount: Function; instance: ComponentInstance } | null;
    private _container: Element | null;

    constructor(rootComponent: ComponentFactory<any>, rootProps?: Record<string, any>);

    use<Options extends any[] = any[]>(plugin: Plugin<Options>, ...options: Options): this;
    provide<T = any>(key: string | symbol, value: T): this;
    component(name: string): ComponentFactory<any> | undefined;
    component(name: string, definition: ComponentFactory<any>): this;
    directive(name: string): any;
    directive(name: string, definition: any): this;
    hook(name: string, fn: AppHook): this;
    beforeMount(fn: AppHook): this;
    mounted(fn: AppHook): this;
    beforeUnmount(fn: AppHook): this;
    unmounted(fn: AppHook): this;
    afterUnmount(fn: AppHook): this;
    mount(selector: string | Element): ComponentInstance;
    unmount(): void;
}

export function createApp(rootComponent: ComponentFactory<any>, rootProps?: Record<string, any>): App;
export type ComponentProps = Record<string, any>
export type EmptyProps = Record<string, never>
export type PropSchema = string[] | Record<string, PropConfig>

export type PropConfig = {
    type?: FunctionConstructor | StringConstructor | NumberConstructor | BooleanConstructor
    default?: any | (() => any)
    required?: boolean
}

export type EmitFn = (eventName: string, ...args: any[]) => void

export type Slots = Record<string, string>

export type SetupContext = {
    emit: EmitFn
    slots: Slots
}

export type ComponentInstance = {
    props: ComponentProps
    state?: any
    provides: Record<string | symbol, any>
    _mountHooks: (() => void)[]
    _unmountHooks: (() => void)[]
    _effects: import('./signal').EffectRunner[]
    _element: HTMLElement | null
    _parent: ComponentInstance | null
    _app: any
    _components: Record<string, ComponentFactory<any>>
    _injector: import('./di').Injector
    _ownsInjector: boolean
}

export type ComponentResult = {
    template: string
    [key: string]: any
}

export type ComponentOptions<TProps = ComponentProps, P = PropSchema> = {
    props?: P
    components?: Record<string, ComponentFactory<any>>
    setup: (props: TProps, ctx: SetupContext) => ComponentResult
    render?: (state: any, components: Record<string, ComponentFactory<any>>) => any[]
}

export type ComponentFactory<TProps = ComponentProps> = (props?: TProps, options?: { listeners?: Record<string, Function>, slots?: Slots, parent?: ComponentInstance | Record<string, any> | null }) => ComponentApi

export type ComponentApi = {
    render: (container: HTMLElement) => ComponentInstance
    unmount: () => void
    instance: ComponentInstance
}

export declare function onMount(fn: () => void): void
export declare function onUnmount(fn: () => void): void
export declare function parseSlots(slotHTML: string): Slots
export declare function getCurrentInstance(): ComponentInstance | null
export declare function setCurrentInstance(instance: ComponentInstance | null): void

export declare function provide<T = any>(key: any, value?: T): void
export { inject } from './di'

type InferPropType<T> = T extends StringConstructor ? string :
    T extends NumberConstructor ? number :
    T extends BooleanConstructor ? boolean :
    any;

type InferProps<P> = P extends string[]
    ? Record<P[number], any>
    : P extends Record<string, PropConfig>
    ? {
        [K in keyof P]: P[K]['required'] extends true
        ? InferPropType<P[K]['type']>
        : InferPropType<P[K]['type']> | (P[K] extends { default: any } ? never : undefined)
    }
    : Record<string, any>;

export declare function defineComponent<P extends PropSchema = any, TProps = InferProps<P>>(options: ComponentOptions<TProps, P>): ComponentFactory<TProps>
export type AsyncComponentLoader<TProps = ComponentProps> = () => Promise<ComponentFactory<TProps> | { default: ComponentFactory<TProps> } | Record<string, any>>

export type AsyncComponentOptions<TProps = ComponentProps> = {
    loader: AsyncComponentLoader<TProps>
    loadingComponent?: ComponentFactory<any>
}

export declare function defineAsyncComponent<TProps = ComponentProps>(loaderOrOptions: AsyncComponentLoader<TProps> | AsyncComponentOptions<TProps>): ComponentFactory<TProps>
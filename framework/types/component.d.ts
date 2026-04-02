// ─── Component Types ─────────────────────────────────────────────────────────

export type ComponentProps = Record<string, any>

export type EmptyProps = Record<string, never>

export type PropSchema = string[] | Record<string, PropConfig>

export type PropConfig = {
    type?: FunctionConstructor | StringConstructor | NumberConstructor | BooleanConstructor
    default?: any | (() => any)
    required?: boolean
}

export type ComponentInstance = {
    props: ComponentProps
    _mountHooks: (() => void)[]
    _unmountHooks: (() => void)[]
    _effects: import('./signal').EffectRunner[]
    _element: HTMLElement | null
}

export type ComponentResult = {
    template: string
    [key: string]: any
}

export type ComponentOptions<TProps = ComponentProps> = {
    props?: PropSchema
    components?: Record<string, ComponentFactory>
    setup: (props: TProps) => ComponentResult
}

export type ComponentFactory<TProps = ComponentProps> = (props?: TProps) => ComponentApi

export type ComponentApi = {
    render: (container: HTMLElement) => ComponentInstance
    unmount: () => void
    instance: ComponentInstance
}

export declare function onMount(fn: () => void): void
export declare function onUnmount(fn: () => void): void
export declare function defineComponent<TProps = EmptyProps>(options: ComponentOptions<TProps>): ComponentFactory<TProps>

type InterpolationPart =
    | { type: 'static'; value: string }
    | { type: 'dynamic'; key: string }

declare function resolveProps(schema: PropSchema, received: ComponentProps): ComponentProps
declare function mountTemplate(template: string, container: HTMLElement, context: ComponentResult, components: Record<string, ComponentFactory>): { effects: (() => void)[] }
declare function processTextNodes(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
declare function processAttrBindings(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
declare function parseInterpolation(str: string): InterpolationPart[]
declare function bindEvents(container: HTMLElement, context: ComponentResult): void
declare function bindComponents(container: HTMLElement, components: Record<string, ComponentFactory>): void

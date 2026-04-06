// ─── Component Types ─────────────────────────────────────────────────────────

export type ComponentProps = Record<string, any>

export type EmptyProps = Record<string, never>

export type PropSchema = string[] | Record<string, PropConfig>

export type PropConfig = {
    type?: FunctionConstructor | StringConstructor | NumberConstructor | BooleanConstructor
    default?: any | (() => any)
    required?: boolean
}

// ── Emit ──────────────────────────────────────────────────────────────────────
// emit('change', value) — calls parent listener registered with @change="handler"
export type EmitFn = (eventName: string, ...args: any[]) => void

// ── Slots ─────────────────────────────────────────────────────────────────────
// slots.default — default slot HTML string
// slots.header  — named slot HTML string
export type Slots = Record<string, string>

// ── Setup context ─────────────────────────────────────────────────────────────
export type SetupContext = {
    emit: EmitFn
    slots: Slots
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
    components?: Record<string, ComponentFactory<any>>
    setup: (props: TProps, ctx: SetupContext) => ComponentResult
}

export type ComponentFactory<TProps = ComponentProps> = (
    props?: TProps,
    options?: { listeners?: Record<string, Function>, slots?: Slots }
) => ComponentApi

export type ComponentApi = {
    render: (container: HTMLElement) => ComponentInstance
    unmount: () => void
    instance: ComponentInstance
}

export declare function onMount(fn: () => void): void
export declare function onUnmount(fn: () => void): void
export declare function parseSlots(slotHTML: string): Slots
export declare function defineComponent<TProps = EmptyProps>(
    options: ComponentOptions<TProps>
): ComponentFactory<TProps>

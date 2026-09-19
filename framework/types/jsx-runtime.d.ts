import type {
    FNode,
    FuseeChildren,
    HTMLIntrinsicElements,
    SVGIntrinsicElements,
    MaybeSignal,
    Signal,
    EventModifierWrapper
} from './jsx-types'

export namespace JSX {
    type Element = FNode

    interface ElementChildrenAttribute {
        children: {}
    }

    interface IntrinsicAttributes {}

    interface IntrinsicElements extends HTMLIntrinsicElements, SVGIntrinsicElements {}
}

export interface SetupContext {
    emit: (event: string, ...args: unknown[]) => void
    slots: Record<string, (() => FNode[]) | undefined>
}

export interface ComponentOptions<P = {}> {
    name?: string
    props?: string[] | Record<string, unknown>
    setup?: (props: P, ctx: SetupContext) => Record<string, unknown> | void
    render?: (state: any, components: Record<string, unknown>) => FNode[]
    template?: string
    components?: Record<string, unknown>
}

export type FuseeComponent<P = {}> = (props: P) => JSX.Element
export declare function defineComponent<P = {}>(options: ComponentOptions<P>): FuseeComponent<P>
export declare function Fragment(props: { children?: FuseeChildren }): JSX.Element

export declare function For<T>(props: {
    each: MaybeSignal<T[]>
    key?: (item: T, index: number) => string | number
    children: (item: Signal<T>, index: number) => JSX.Element
}): JSX.Element

export declare function Show<T>(props: {
    when: MaybeSignal<T>
    fallback?: JSX.Element | (() => JSX.Element)
    children: JSX.Element | ((value: NonNullable<T>) => JSX.Element)
}): JSX.Element

export declare function Slot(props: { name: string; children?: FuseeChildren }): JSX.Element
export declare function on<E = Event>(handler: (event: E) => void, modifiers?: string[]): EventModifierWrapper<E>

export declare function jsx(type: unknown, props: Record<string, unknown> | null, key?: string | number): JSX.Element
export declare function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string | number): JSX.Element
export declare function jsxDEV(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string | number,
    isStaticChildren?: boolean,
    source?: unknown,
    self?: unknown
): JSX.Element
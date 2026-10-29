import type { ComponentFactory, ComponentResult, EmitFn } from './component'

export interface CSSResult {
    readonly cssText: string
    /** Shared constructed stylesheet, or null where adoptedStyleSheets is unsupported. */
    readonly styleSheet: CSSStyleSheet | null
    toString(): string
}

export declare function css(strings: TemplateStringsArray, ...values: (CSSResult | number)[]): CSSResult
export declare function unsafeCSS(value: unknown): CSSResult

export type ElementStyles = CSSResult | string | ElementStyles[]

type PropTypeConstructor =
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | ArrayConstructor
    | ObjectConstructor
    | FunctionConstructor

export interface AttributeConverter<T = any> {
    /** Converts an attribute value (null when removed) to a prop value; undefined restores the default. */
    fromAttribute?(value: string | null, type?: PropTypeConstructor): T | undefined
    /** Converts a prop value to an attribute value; null removes the attribute. */
    toAttribute?(value: T, type?: PropTypeConstructor): string | null
}

export interface ElementPropConfig<T = any> {
    type?: PropTypeConstructor
    default?: T | (() => T)
    required?: boolean
    /** Attribute name to sync with (default: kebab-case of the prop name), or false for property-only. */
    attribute?: string | false
    /** Write the prop back to its attribute whenever it changes. */
    reflect?: boolean
    converter?: AttributeConverter<T>
}

export type ElementPropSchema = string[] | Record<string, ElementPropConfig | PropTypeConstructor>

type InferElementPropType<T> =
    T extends StringConstructor ? string :
    T extends NumberConstructor ? number :
    T extends BooleanConstructor ? boolean :
    T extends ArrayConstructor ? any[] :
    T extends ObjectConstructor ? Record<string, any> :
    T extends FunctionConstructor ? (...args: any[]) => any :
    any

type InferElementProps<P> = P extends string[]
    ? Record<P[number], any>
    : P extends Record<string, any>
    ? {
        [K in keyof P]: P[K] extends PropTypeConstructor
            ? InferElementPropType<P[K]> | undefined
            : P[K] extends ElementPropConfig
            ? InferElementPropType<P[K]['type']> | (P[K] extends { default: any } | { required: true } ? never : undefined)
            : any
    }
    : Record<string, any>

export type ShadowOption = boolean | ShadowRootMode | Partial<ShadowRootInit>

export interface ElementSetupContext<TProps = Record<string, any>> {
    /** Dispatches a bubbling, composed CustomEvent from the host; one argument becomes `detail`. */
    emit: EmitFn
    slots: Record<string, string>
    /**
     * The custom element instance; assign to its props to update them. It is null while
     * the element renders on the server, so only use it in handlers and lifecycle hooks there.
     */
    host: HTMLElement & TProps
    /** The element's shadow root (also for closed mode), or null in light-DOM mode. */
    shadowRoot: ShadowRoot | null
}

export interface ElementOptions<P extends ElementPropSchema = any, TProps = InferElementProps<P>> {
    props?: P
    /** Styles scoped to the shadow root; in light-DOM mode they are added to the document once. */
    styles?: ElementStyles
    /** Shadow root mode (default 'open'), attachShadow() options, or false to render into the host. */
    shadow?: ShadowOption
    components?: Record<string, ComponentFactory<any>>
    setup?: (props: Readonly<TProps>, ctx: ElementSetupContext<TProps>) => ComponentResult | Record<string, any>
    render?: (state: any, components: Record<string, ComponentFactory<any>>) => any[]
    /** Compiled SSR render function, used by renderElementsSSR() instead of compiling the string template. */
    renderSSR?: (state: any, components: Record<string, any>) => string | Promise<string>
}

export type FuseeElementConstructor<TProps = Record<string, any>> = {
    new (): HTMLElement & TProps
    readonly observedAttributes: string[]
    readonly tagName: string
}

export declare function defineElement<P extends ElementPropSchema = any, TProps = InferElementProps<P>>(
    tagName: `${string}-${string}`,
    options: ElementOptions<P, TProps>
): FuseeElementConstructor<TProps>

export declare function toCustomElement<TProps = Record<string, any>>(
    component: ComponentFactory<TProps>,
    tagName: `${string}-${string}`,
    overrides?: Partial<ElementOptions>
): FuseeElementConstructor<TProps>

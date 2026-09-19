export interface Signal<T> {
    (): T
    (value: T): T
    isSignal: true
    readonly?: boolean
}

export type MaybeSignal<T> = T | Signal<T> | (() => T)
export interface EventModifierWrapper<E = Event> {
    __fuseeEvent: true
    handler: (event: E) => void
    modifiers: string[]
}

export type EventHandlerProp<E = Event> = ((event: E) => void) | EventModifierWrapper<E>
export interface FNode {
    node: Node | Comment | null
    effects?: Array<(() => void) | undefined>
    [key: string]: unknown
}

export type FuseeChildren =
    | FNode
    | string
    | number
    | boolean
    | null
    | undefined
    | (() => unknown)
    | FuseeChildren[]

export interface FuseeDOMAttributes {
    children?: FuseeChildren
    class?: MaybeSignal<string | Record<string, boolean> | Array<string | false | null | undefined>>
    style?: MaybeSignal<string | Partial<CSSStyleDeclaration>>

    'f-show'?: MaybeSignal<boolean>
    'f-html'?: MaybeSignal<string>
    'f-model'?: Signal<any>
    'f-ref'?: Signal<Element | null>
    'f-once'?: boolean

    onClick?: EventHandlerProp<MouseEvent>
    onDblclick?: EventHandlerProp<MouseEvent>
    onContextmenu?: EventHandlerProp<MouseEvent>
    onInput?: EventHandlerProp<InputEvent>
    onBeforeinput?: EventHandlerProp<InputEvent>
    onChange?: EventHandlerProp<Event>
    onSubmit?: EventHandlerProp<SubmitEvent>
    onFocus?: EventHandlerProp<FocusEvent>
    onFocusin?: EventHandlerProp<FocusEvent>
    onFocusout?: EventHandlerProp<FocusEvent>
    onBlur?: EventHandlerProp<FocusEvent>
    onKeydown?: EventHandlerProp<KeyboardEvent>
    onKeyup?: EventHandlerProp<KeyboardEvent>
    onMousedown?: EventHandlerProp<MouseEvent>
    onMouseup?: EventHandlerProp<MouseEvent>
    onMouseover?: EventHandlerProp<MouseEvent>
    onMouseout?: EventHandlerProp<MouseEvent>
    onMousemove?: EventHandlerProp<MouseEvent>
    onPointerdown?: EventHandlerProp<PointerEvent>
    onPointerup?: EventHandlerProp<PointerEvent>
    onPointerover?: EventHandlerProp<PointerEvent>
    onPointerout?: EventHandlerProp<PointerEvent>
    onPointermove?: EventHandlerProp<PointerEvent>
    onTouchstart?: EventHandlerProp<TouchEvent>
    onTouchmove?: EventHandlerProp<TouchEvent>
    onTouchend?: EventHandlerProp<TouchEvent>

    [dataAttr: `data-${string}`]: MaybeSignal<string | number | boolean> | undefined
    [ariaAttr: `aria-${string}`]: MaybeSignal<string | number | boolean> | undefined
}

type ElementAttributes<E extends Element> = FuseeDOMAttributes & {
    [K in keyof E as K extends keyof FuseeDOMAttributes
        ? never
        : E[K] extends Function
        ? never
        : K]?: MaybeSignal<E[K]>
}

export type HTMLIntrinsicElements = {
    [K in keyof HTMLElementTagNameMap]: ElementAttributes<HTMLElementTagNameMap[K]>
}

export type SVGIntrinsicElements = {
    [K in keyof SVGElementTagNameMap]: ElementAttributes<SVGElementTagNameMap[K]>
}
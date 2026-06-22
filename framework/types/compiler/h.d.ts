export interface FNode {
    node: Node
    effects: Array<() => void>
    _isIf?: boolean
    _isFor?: boolean
    _isSlot?: boolean
    _tag?: string
    _component?: ComponentApi
    _ifBranchNodes?: () => FNode[]
    _getNodes?: () => FNode[]
    _slotNodes?: FNode[]
    props?: Record<string, unknown>
    children?: FNode[]
}

export interface ComponentApi {
    render(container: HTMLElement): unknown
    unmount(): void
    instance: unknown
}

export type StaticPropValue = string | boolean | null
export type PropGetter<T = unknown> = () => T
export interface EventDescriptor {
    handler:   ((...args: unknown[]) => void) | null
    modifiers: string[]
}

export type SlotMap = Record<string, () => FNode[]>
export type PropsMap = Record<string, StaticPropValue | PropGetter | EventDescriptor | true>

export declare function h(tag: string, props?: PropsMap, children?: FNode[], isStatic?: boolean): FNode
export declare function hText(value: string | (() => string)): FNode
export declare function hIf(branches: Array<[(() => boolean) | null, () => FNode[]]>): FNode
export declare function hFor<T>(sourceGetter: () => T[], renderItem: (item: T, index?: number) => FNode, keyFn: (item: T, index?: number) => unknown): FNode
export declare function hSlot(slots: SlotMap | null | undefined, name: string, fallback?: FNode[]): FNode
export declare function createComponent(name: string, ComponentFn: ((...args: unknown[]) => ComponentApi) | undefined | null, rawProps?: PropsMap, rawSlots?: SlotMap): FNode

export interface MountedApp {
    unmount(): void
}

export declare function mount(renderFn: (ctx: unknown, components: Record<string, unknown>) => FNode[], ctx: unknown, components: Record<string, unknown>, container: HTMLElement): MountedApp

export declare const _effect: (fn: () => void) => () => void
export declare const _batch:  <T>(fn: () => T) => T
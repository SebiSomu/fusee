import type { ComponentResult, ComponentFactory } from './component'

export function processDirectives(
    root: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>,
    effects: (() => void)[]
): void

export function processRefs(root: HTMLElement, context: ComponentResult): void

export function processModel(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void

export function processFor(
    root: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>,
    effects: (() => void)[]
): void

export function processIf(
    root: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>,
    effects: (() => void)[]
): void

export function processIs(
    root: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>,
    effects: (() => void)[]
): void

export function processShow(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
export function processHtml(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
export function processText(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
export function processEvents(root: HTMLElement, context: ComponentResult): void
export function processClassList(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
export function processCloak(root: HTMLElement): void

export interface DirectiveBinding<V = any> {
    value: V
    expression: string
    arg: string | null
    modifiers: string[]
}

export interface DirectiveHooks<V = any> {
    mounted?: (el: HTMLElement, binding: DirectiveBinding<V>) => void
    updated?: (el: HTMLElement, binding: DirectiveBinding<V>) => void
    unmounted?: (el: HTMLElement, binding: DirectiveBinding<V>) => void
}

export function directive<V = any>(name: string, hooks: DirectiveHooks<V>): void

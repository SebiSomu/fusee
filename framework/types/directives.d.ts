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

export function processShow(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
export function processHtml(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void

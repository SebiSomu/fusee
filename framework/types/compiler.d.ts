import type { ComponentResult, ComponentFactory } from './component'

export function mountTemplate(
    template: string,
    container: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>
): { effects: (() => void)[] }

export function compileNode(
    node: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>,
    effects: (() => void)[]
): void

export function processTextNodes(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void

export function processAttrBindings(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void

export function bindEvents(container: HTMLElement, context: ComponentResult): void

export function bindComponents(
    container: HTMLElement,
    components: Record<string, ComponentFactory>,
    context: ComponentResult,
    effects: (() => void)[]
): void

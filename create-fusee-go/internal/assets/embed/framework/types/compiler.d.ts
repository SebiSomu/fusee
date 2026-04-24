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

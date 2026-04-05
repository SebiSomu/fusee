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

function processTextNodes(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
function processAttrBindings(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void

function bindComponents(
    container: HTMLElement,
    components: Record<string, ComponentFactory>,
    context: ComponentResult,
    effects: (() => void)[]
): void

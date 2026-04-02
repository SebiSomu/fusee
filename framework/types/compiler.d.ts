import type { ComponentResult, ComponentFactory } from './component'

export type InterpolationPart = {
    type: 'static' | 'dynamic'
    value?: string
    key?: string
}

declare function mountTemplate(
    template: string,
    container: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>
): { effects: (() => void)[] }

declare function compileNode(
    node: HTMLElement,
    context: ComponentResult,
    components: Record<string, ComponentFactory>,
    effects: (() => void)[]
): void

declare function processTextNodes(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
declare function processAttrBindings(root: HTMLElement, context: ComponentResult, effects: (() => void)[]): void
declare function processDirectives(root: HTMLElement, context: ComponentResult, components: Record<string, ComponentFactory>, effects: (() => void)[]): void
declare function parseInterpolation(str: string): InterpolationPart[]
declare function bindEvents(container: HTMLElement, context: ComponentResult): void
declare function bindComponents(container: HTMLElement, components: Record<string, ComponentFactory>, context: ComponentResult, effects: (() => void)[]): void
declare function evaluateExpression(expr: string, context: ComponentResult): any
declare function sanitizeAttr(name: string, value: string): string

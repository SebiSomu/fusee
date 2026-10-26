export const DELEGATED_EVENTS: Set<string>

export function isDelegatedEvent(eventName: string): boolean

export interface DelegatedEventOptions {
    modifiers?: string[]
    context?: Record<string, any>
    expr?: string
}

export function registerDelegatedEvent(
    element: Element,
    eventType: string,
    handler: (event: Event) => void,
    options?: DelegatedEventOptions
): () => void

/**
 * Makes delegated events work inside a shadow root. Required for closed roots;
 * harmless for open ones. Returns a function that unregisters the root.
 */
export function installDelegationRoot(root: ShadowRoot): () => void

export function createEventHandler(
    handler: Function | string,
    modifiers: string[],
    context: Record<string, any>,
    expr: string
): (event: Event) => void

export interface EventHandlerSyntax {
    delegated: `@${string}`
    native: `on:${string}`
}

declare global {
    const isDelegatedEvent: typeof import('./event-delegation').isDelegatedEvent
}

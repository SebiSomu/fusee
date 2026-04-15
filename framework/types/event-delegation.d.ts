// ─── Event Delegation Types ────────────────────────────────────────────────

/**
 * Set of standard events that support delegation.
 * These events bubble and are commonly used in UI interactions.
 */
export const DELEGATED_EVENTS: Set<string>

/**
 * Check if an event type is delegated.
 * @param eventName - The event name to check (e.g., 'click', 'keydown')
 * @returns True if the event can be delegated
 */
export function isDelegatedEvent(eventName: string): boolean

/**
 * Options for registering a delegated event.
 */
export interface DelegatedEventOptions {
    /** Event modifiers (e.g., 'prevent', 'stop', 'debounce', 'throttle') */
    modifiers?: string[]
    /** Component context for evaluating expressions */
    context?: Record<string, any>
    /** Expression string to evaluate */
    expr?: string
}

/**
 * Register a delegated event handler for an element.
 * Creates a single document-level listener if not already present.
 *
 * @param element - The DOM element to register
 * @param eventType - The event type (e.g., 'click', 'input')
 * @param handler - The event handler function
 * @param options - Optional configuration
 * @returns Cleanup function to remove the handler
 */
export function registerDelegatedEvent(
    element: Element,
    eventType: string,
    handler: (event: Event) => void,
    options?: DelegatedEventOptions
): () => void

/**
 * Create a wrapped event handler with modifier support.
 * Supports: prevent, stop, self, debounce, throttle, keyboard modifiers.
 *
 * @param handler - The original handler (function or expression)
 * @param modifiers - Array of modifier names
 * @param context - Component context for evaluating expressions
 * @param expr - Expression string (when handler is a string)
 * @returns Wrapped handler function
 */
export function createEventHandler(
    handler: Function | string,
    modifiers: string[],
    context: Record<string, any>,
    expr: string
): (event: Event) => void

/**
 * Event handler syntax preference.
 * Use @ prefix for delegated events (optimized, single document listener).
 * Use on: prefix for native events (individual element listeners, full event control).
 *
 * @example
 * // Delegated - efficient for many elements
 * <button @click="handleClick">Click</button>
 *
 * @example
 * // Native - full control including stopPropagation
 * <button on:click="handleClick">Click</button>
 *
 * @example
 * // With modifiers
 * <form @submit.prevent="handleSubmit">Submit</form>
 * <input @keydown.enter="handleEnter" />
 * <input @input.debounce="handleInput" />
 */
export interface EventHandlerSyntax {
    /** Delegated event: @click, @input, @keydown, etc. */
    delegated: `@${string}`
    /** Native event: on:click, on:input, on:custom, etc. */
    native: `on:${string}`
}

declare global {
    const isDelegatedEvent: typeof import('./event-delegation').isDelegatedEvent
}

/**
 * Context Protocol (https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md)
 * support. Custom elements have no fusée parent instance, so provide()/inject() reach across
 * element boundaries by dispatching `context-request` events up the composed DOM tree.
 * The same events let fusée interoperate with other implementations such as @lit/context.
 */

/** Reserved context key answered with the nearest fusée component instance. */
export const FUSEE_PARENT_CONTEXT = Symbol.for('fusee.parentInstance')

/** Looks up a provided key on a component instance, unwrapping provider configs like inject() does. */
export function resolveProvided(instance, key, options) {
    if (!instance || !instance.provides || !(key in instance.provides)) return { found: false }

    const val = instance.provides[key]
    const isTokenProvider = key && typeof key === 'object' && key.provide
    if (val === undefined && isTokenProvider) return { found: false }

    if (val && typeof val === 'object' && ('useClass' in val || 'useFactory' in val || 'useExisting' in val)) {
        return { found: true, value: instance._injector.get(key, options) }
    }
    if (val && typeof val === 'object' && 'useValue' in val) {
        return { found: true, value: val.useValue }
    }
    return { found: true, value: val }
}

/** Dispatches a context-request from a target and returns the first synchronous answer. */
export function requestContext(target, context) {
    const result = { found: false, value: undefined }

    const event = new Event('context-request', { bubbles: true, composed: true })
    event.context = context
    event.contextTarget = target
    event.subscribe = false
    event.callback = (value) => {
        if (result.found) return
        result.found = true
        result.value = value
    }

    target.dispatchEvent(event)
    return result
}

/**
 * Makes a rendered component answer context requests from its subtree: the reserved parent
 * key with the instance itself, and any other key it can resolve through its provides chain.
 * Returns a function that stops answering.
 */
export function attachContextResponder(container, instance) {
    if (typeof container?.addEventListener !== 'function') return () => {}

    const onRequest = (event) => {
        const origin = event.contextTarget ?? event.composedPath()[0]
        if (origin === container) return

        if (event.context === FUSEE_PARENT_CONTEXT) {
            event.stopPropagation()
            event.callback(instance)
            return
        }

        const provided = resolveProvided(instance, event.context)
        if (!provided.found) return
        event.stopPropagation()
        event.callback(provided.value)
    }

    container.addEventListener('context-request', onRequest)
    return () => container.removeEventListener('context-request', onRequest)
}

/** Finds the custom element host that owns a component instance, walking up its parents. */
export function findInstanceHost(instance) {
    let current = instance
    while (current) {
        if (current._host) return current._host
        current = current._parent
    }
    return null
}

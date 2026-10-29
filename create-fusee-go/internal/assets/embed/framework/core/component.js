// Components with string templates: defineComponent() brings the runtime template compiler.
// Everything else lives in component-core.js, which compiled-only code can import alone.
import { mountTemplate } from './compiler.js'
import { createComponentDefinition } from './component-core.js'

export * from './component-core.js'

/** Creates a component factory with setup, rendering (string template or compiled render), props, slots, and lifecycle state. */
export function defineComponent(options) {
    return createComponentDefinition(options, mountTemplate)
}

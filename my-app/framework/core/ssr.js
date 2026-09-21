import { withSignalScope } from './signal-scope.js'

/** Reads a signal accessor while leaving ordinary values unchanged. */
export function ssrVal(v) {
    return (v != null && typeof v === 'function' && v.isSignal) ? v() : v
}

/** Escapes text for safe insertion into server-rendered HTML. */
export function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
}

/** Escapes text for safe insertion into an HTML attribute value. */
export function escapeAttr(str) {
    return escapeHtml(str)
}

/** Converts array or object class syntax into a space-separated class string. */
export function renderClass(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(' ')
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).filter(([, v]) => !!v).map(([k]) => k).join(' ')
    }
    return String(value ?? '')
}

/** Converts a style object into serialized kebab-case CSS declarations. */
export function renderStyle(value) {
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).map(([k, v]) => `${kebab(k)}:${v}`).join(';')
    }
    return String(value ?? '')
}

/** Converts a camelCase style property into kebab-case CSS syntax. */
function kebab(str) {
    return str.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
}

/** Iterates arrays, maps, iterables, and objects as [value, key, index] tuples. */
export function* ssrEnumerate(source) {
    if (Array.isArray(source)) {
        for (let i = 0; i < source.length; i++)
            yield [source[i], i]
    } else if (source instanceof Map) {
        let i = 0
        for (const [k, v] of source)
            yield [v, k, i++]
    } else if (source && typeof source[Symbol.iterator] === 'function') {
        let i = 0
        for (const v of source)
            yield [v, i++]
    } else if (source && typeof source === 'object') {
        let i = 0
        for (const k of Object.keys(source))
            yield [source[k], k, i++]
    }
}

/** Runs component setup in a signal scope and renders its SSR output. */
export async function renderComponentSSR(componentDef, props, slots, scopeId) {
    if (!componentDef) return ''

    return withSignalScope(scopeId, async () => {
        const state = componentDef.setup(props, { emit: () => {}, slots })
        const resolvedState = state && typeof state.then === 'function' ? await state : state
        return componentDef.renderSSR(resolvedState, componentDef.components || {})
    })
}

/** Renders a root component in the reserved root signal scope. */
export async function renderRootSSR(componentDef, props = {}) {
    return renderComponentSSR(componentDef, props, {}, '__root__')
}
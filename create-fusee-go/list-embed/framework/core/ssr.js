import { withSignalScope } from './signal-scope.js'

export function ssrVal(v) {
    return (v != null && typeof v === 'function' && v.isSignal) ? v() : v
}

export function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
}

export function escapeAttr(str) {
    return escapeHtml(str)
}

export function renderClass(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(' ')
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).filter(([, v]) => !!v).map(([k]) => k).join(' ')
    }
    return String(value ?? '')
}

export function renderStyle(value) {
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).map(([k, v]) => `${kebab(k)}:${v}`).join(';')
    }
    return String(value ?? '')
}

function kebab(str) {
    return str.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
}

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

export async function renderComponentSSR(componentDef, props, slots, scopeId) {
    if (!componentDef) return ''

    return withSignalScope(scopeId, async () => {
        const state = componentDef.setup(props, { emit: () => {}, slots })
        const resolvedState = state && typeof state.then === 'function' ? await state : state
        return componentDef.renderSSR(resolvedState, componentDef.components || {})
    })
}

export async function renderRootSSR(componentDef, props = {}) {
    return renderComponentSSR(componentDef, props, {}, '__root__')
}
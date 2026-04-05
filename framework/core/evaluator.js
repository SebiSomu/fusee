export const MUSTACHE_RE = /\{\{\s*(.+?)\s*\}\}/

const SENSITIVE_ATTRS = ['href', 'src', 'srcset', 'formaction', 'xlink:href', 'data']
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file):/i

export function evaluateExpression(expr, context, extraContext = {}, unwrapSignals = true) {
    const keys = []
    const values = []

    // Map global context
    for (const k in context) {
        keys.push(k)
        const val = context[k]
        values.push(unwrapSignals && typeof val === 'function' && val.isSignal ? val() : val)
    }

    // Map extra context (like $event)
    for (const k in extraContext) {
        if (!keys.includes(k)) {
            keys.push(k)
            values.push(extraContext[k])
        }
    }

    try {
        const isMultiStatement = expr.includes(';') || expr.includes('console.')
        const body = isMultiStatement ? expr : `return ${expr}`
        const fn = new Function(...keys, body)
        return fn(...values)
    } catch (e) {
        console.warn(`[framework] Error evaluating "${expr}":`, e)
        return ''
    }
}

export function parseInterpolation(str) {
    const parts = []
    const regex = /\{\{\s*(.+?)\s*\}\}/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(str)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'static', value: str.slice(lastIndex, match.index) })
        }
        parts.push({ type: 'dynamic', key: match[1] })
        lastIndex = regex.lastIndex
    }

    if (lastIndex < str.length) {
        parts.push({ type: 'static', value: str.slice(lastIndex) })
    }

    return parts
}

export function sanitizeAttr(name, value) {
    const attrName = name.toLowerCase()
    if (SENSITIVE_ATTRS.includes(attrName)) {
        const trimmed = value.trim()
        if (DANGEROUS_SCHEMES.test(trimmed)) {
            console.warn(`[framework] Blocked potential XSS on ${name}: "${value}"`)
            return 'about:blank'
        }
    }
    return value
}

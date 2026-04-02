
export const MUSTACHE_RE = /\{\{\s*(.+?)\s*\}\}/

const SENSITIVE_ATTRS = ['href', 'src', 'srcset', 'formaction', 'xlink:href', 'data']
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file):/i

/**
 * Evaluates an expression string in a given context.
 * Automatically unwraps signals for top-level keys.
 */
export function evaluateExpression(expr, context) {
    const keys = []
    const values = []

    for (const k in context) {
        keys.push(k);
        const val = context[k];
        values.push(typeof val === 'function' && val.isSignal ? val() : val);
    }

    try {
        const fn = new Function(...keys, `return ${expr}`)
        return fn(...values)
    } catch (e) {
        console.warn(`[framework] Error evaluating expression "${expr}":`, e)
        return ''
    }
}

/**
 * Parses a string containing mustache-style interpolations.
 */
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

/**
 * Sanitizes attribute values to prevent XSS.
 */
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

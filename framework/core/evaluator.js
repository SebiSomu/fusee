export const MUSTACHE_RE = /\{\{\s*(.+?)\s*\}\}/

const SENSITIVE_ATTRS = ['href', 'src', 'srcset', 'formaction', 'xlink:href', 'data']
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file):/i

export function evaluateExpression(expr, context, extraContext = {}, unwrapSignals = true) {
    const keys = []
    const values = []

    const exprWithoutStrings = expr.replace(/'[^']*'|"[^"]*"/g, ' ')
    const identifiers = new Set(exprWithoutStrings.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [])

    for (const k in context) {
        if (identifiers.has(k)) {
            keys.push(k)
            const val = context[k]
            // Pass signal functions directly (not unwrapped) so they're called inside the effect
            // This ensures proper reactive tracking when currentEffect is set
            values.push(val)
        }
    }

    for (const k in extraContext) {
        if (!keys.includes(k)) {
            keys.push(k)
            values.push(extraContext[k])
        }
    }

    try {
        const isMultiStatement = expr.includes(';') || expr.includes('console.')
        // Build unwrapping code for signals - this runs INSIDE the created function
        // so currentEffect is properly set when signal accessors are called
        let body
        if (isMultiStatement) {
            // For multi-statement, we can't easily unwrap - pass values as-is
            body = expr
        } else {
            // Only unwrap identifiers that are actually in keys (i.e., found in context)
            const keysToUnwrap = unwrapSignals ? keys : []
            const unwrapStatements = keysToUnwrap.map(id =>
                `const __${id} = typeof ${id} === 'function' && ${id}.isSignal ? ${id}() : ${id};`
            ).join('\n')
            // Replace identifiers with their unwrapped versions
            let wrappedExpr = expr
            for (const id of keysToUnwrap) {
                wrappedExpr = wrappedExpr.replace(new RegExp('\\b' + id + '\\b', 'g'), '__' + id)
            }
            body = (unwrapStatements ? unwrapStatements + '\n' : '') + `return ${wrappedExpr}`
        }
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

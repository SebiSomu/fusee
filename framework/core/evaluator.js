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
        let body
        if (isMultiStatement) {
            body = expr
        } else {
            const keysToUnwrap = unwrapSignals ? keys : []
            const unwrapStatements = keysToUnwrap.map(id =>
                `const __${id} = typeof ${id} === 'function' && ${id}.isSignal ? ${id}() : ${id};`
            ).join('\n')
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
    let i = 0
    let lastIndex = 0

    while (i < str.length) {
        if (str[i] === '{' && str[i+1] === '{') {
            if (i > 0 && str[i-1] === '\\') {
                if (i - 1 > lastIndex) {
                    parts.push({ type: 'static', value: str.slice(lastIndex, i - 1) })
                }
                parts.push({ type: 'static', value: '{{' })
                i += 2
                lastIndex = i
                continue
            }

            if (i > lastIndex) {
                parts.push({ type: 'static', value: str.slice(lastIndex, i) })
            }

            let start = i + 2
            let j = start
            let braceLevel = 0
            let inString = false
            let stringChar = null

            while (j < str.length) {
                const char = str[j]
                
                if (inString) {
                    if (char === '\\') {
                        j += 2
                        continue
                    }
                    if (char === stringChar) {
                        inString = false
                    }
                    j++
                    continue
                }

                if (char === "'" || char === '"' || char === '`') {
                    inString = true
                    stringChar = char
                    j++
                    continue
                }

                if (char === '{') {
                    braceLevel++
                    j++
                    continue
                }

                if (char === '}') {
                    if (braceLevel > 0) {
                        braceLevel--
                        j++
                        continue
                    } else if (j + 1 < str.length && str[j+1] === '}') {
                        const key = str.slice(start, j).trim()
                        parts.push({ type: 'dynamic', key })
                        i = j + 2
                        lastIndex = i
                        break
                    }
                }

                j++
            }

            if (j >= str.length) {
                parts.push({ type: 'static', value: '{{' })
                i += 2
                lastIndex = i
                continue
            }

        } else {
            i++
        }
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

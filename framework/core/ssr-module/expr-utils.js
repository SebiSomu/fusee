const GLOBALS = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Date',
    'Math', 'JSON', 'Promise', 'Map', 'Set', 'Symbol',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'console',
    'typeof', 'instanceof', 'void', 'delete', 'new', 'return',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'function', 'class', 'const', 'let',
    'var', 'import', 'export', 'default', 'this',
])

export class ExprScope {
    constructor() {
        this.localScopes = []
    }

    push(names) {
        this.localScopes.push(new Set((names ?? []).filter(Boolean)))
    }

    pop() {
        this.localScopes.pop()
    }

    isLocal(id) {
        return this.localScopes.some(s => s.has(id))
    }

    wrap(expr) {
        if (!expr) return "''"
        if (expr.includes('_ctx.')) return expr
        return this._rewrite(expr)
    }

    _rewrite(expr) {
        return expr.replace(
            /(['"`])(?:(?!\1)[^\\]|\\.)*\1|(?<![.\w$])([a-zA-Z_$][a-zA-Z0-9_$]*)(?!\s*:)/g,
            (match, quote, id, offset, fullStr) => {
                if (quote) return match
                if (!id) return match
                if (GLOBALS.has(id)) return match
                if (this.isLocal(id)) return match
                const rest = fullStr.slice(offset + match.length)
                if (/^\s*\(/.test(rest)) {
                    return `_ctx.${id}`
                }
                return `unref(_ctx.${id})`
            }
        )
    }
}
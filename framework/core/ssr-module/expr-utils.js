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
        if (expr.includes('_ctx.')) return expr
        if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(expr.trim())) {
            const id = expr.trim()
            const rootVar = id.split('.')[0]
            if (this.isLocal(rootVar)) return id
            return `(typeof _ctx.${id} === 'function' && _ctx.${id}.isSignal ? _ctx.${id}() : _ctx.${id})`
        }
        return this._rewrite(expr)
    }

    _rewrite(expr) {
        return expr.replace(
            /(?<![.\w$])([a-zA-Z_$][a-zA-Z0-9_$]*)(?!\s*:)(?=\s*[\(\.\,\)\]\s+\|\&\!\?\+\-\*\/\%\=\<\>]|$)/g,
            (match, id) => {
                if (GLOBALS.has(id)) return match
                if (this.isLocal(id)) return match
                return `_ctx.${id}`
            }
        )
    }
}
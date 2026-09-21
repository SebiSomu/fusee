export class ExprScope {
    constructor() {
        this._frames = []
    }

    push(names) {
        this._frames.push(new Set(names.filter(Boolean)))
    }
    pop() {
        this._frames.pop()
    }
    _locals() {
        if (this._frames.length === 0) return _EMPTY
        const all = new Set()
        for (const frame of this._frames)
            for (const name of frame) all.add(name)
        return all
    }

    wrap(expr) {
        if (!expr || typeof expr !== 'string') return String(expr)
        const locals = this._locals()

        return expr.replace(
            // Match a bare identifier that is NOT preceded by `.` (member access)
            /(^|[^.\w$])([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
            (match, prefix, name) => {
                if (_SKIP.has(name)) return match
                if (locals.has(name)) return match
                return `${prefix}ssrVal(_ctx.${name})`
            }
        )
    }
}

const _EMPTY = new Set()
const _SKIP = new Set([
    // literals / special values
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    // keywords
    'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'throw', 'try', 'catch', 'finally',
    'class', 'function', 'var', 'let', 'const', 'import', 'export',
    'async', 'await', 'yield', 'static', 'super', 'this',
    // runtime helpers injected by the generator (already in scope as imports)
    'escapeHtml', 'escapeAttr', 'renderClass', 'renderStyle',
    'ssrEnumerate', 'renderComponentSSR', 'ssrVal',
    // common browser / Node globals
    'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number',
    'Boolean', 'Date', 'RegExp', 'Error', 'Promise', 'Map', 'Set',
    'Symbol', 'WeakMap', 'WeakSet', 'globalThis', 'window', 'document',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
])

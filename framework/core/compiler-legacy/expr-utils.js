/**
 * ExprScope — lightweight expression scope tracker for the SSR generator.
 *
 * Tracks locally-bound identifiers (from f-for loops) so wrap() knows which
 * bare identifiers come from the template context (_ctx) vs. loop variables.
 *
 * wrap(expr) rewrites every bare identifier that is NOT locally bound to
 * ssrVal(_ctx.<name>), which auto-unwraps signals while leaving plain values
 * unchanged. Local variables (loop item/index names) pass through as-is.
 *
 * Usage:
 *   const scope = new ExprScope()
 *   scope.wrap('name')            // → 'ssrVal(_ctx.name)'
 *   scope.push(['item', 'idx'])   // enter f-for scope
 *   scope.wrap('item.id')         // → 'item.id'  (item is local)
 *   scope.wrap('name')            // → 'ssrVal(_ctx.name)'
 *   scope.pop()                   // exit f-for scope
 */
export class ExprScope {
    constructor() {
        /** @type {Array<Set<string>>} */
        this._frames = []
    }

    /** Push a new scope frame with the given local variable names. */
    push(names) {
        this._frames.push(new Set(names.filter(Boolean)))
    }

    /** Pop the most recently pushed scope frame. */
    pop() {
        this._frames.pop()
    }

    /** Collect all currently locally-bound identifiers across all frames. */
    _locals() {
        if (this._frames.length === 0) return _EMPTY
        const all = new Set()
        for (const frame of this._frames)
            for (const name of frame) all.add(name)
        return all
    }

    /**
     * Rewrite a template expression so that bare identifiers that are not
     * locally bound are wrapped as `ssrVal(_ctx.<name>)`.
     *
     * - member accesses (`obj.prop`) are left intact — only the root
     *   identifier is checked.
     * - JS keywords, literals, and common globals are never prefixed.
     * - Locally bound names (from f-for push) are never prefixed.
     *
     * @param {string} expr
     * @returns {string}
     */
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

/** JS keywords and common globals that must never be prefixed with _ctx. */
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

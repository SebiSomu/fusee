export const ErrorCode = {
    UNEXPECTED_CHAR: 'E001',
    UNTERMINATED_STRING: 'E002',
    UNTERMINATED_MUSTACHE: 'E003',
    UNTERMINATED_TAG: 'E004',
    MALFORMED_COMMENT: 'E005',
    UNEXPECTED_TOKEN: 'P001',
    MISSING_CLOSING_TAG: 'P002',
    UNEXPECTED_CLOSING_TAG: 'P003',
    INVALID_DIRECTIVE_SYNTAX: 'P004',
    INVALID_FOR_SYNTAX: 'P005',
    DUPLICATE_KEY: 'P006',
    V_ELSE_NO_IF: 'P007',
    EMPTY_EXPRESSION: 'P008',
    INVALID_SLOT_NAME: 'P009',
    DUPLICATE_DIRECTIVE: 'T001',
    FOR_MISSING_KEY: 'T002',
    MODEL_ON_NON_INPUT: 'T003',
    COMPONENT_NOT_REGISTERED: 'T004',
    UNKNOWN_IDENTIFIER: 'S001',
    STATIC_FOR_KEY: 'S002',
    UNKNOWN_NODE_TYPE: 'G001',
}

const ERROR_MESSAGES = {
    [ErrorCode.UNEXPECTED_CHAR]: 'Unexpected character "{0}"',
    [ErrorCode.UNTERMINATED_STRING]: 'Unterminated string literal',
    [ErrorCode.UNTERMINATED_MUSTACHE]: 'Unterminated mustache expression "{0}"',
    [ErrorCode.UNTERMINATED_TAG]: 'Unterminated tag "<{0}"',
    [ErrorCode.MALFORMED_COMMENT]: 'Malformed HTML comment',
    [ErrorCode.UNEXPECTED_TOKEN]: 'Unexpected token "{0}", expected "{1}"',
    [ErrorCode.MISSING_CLOSING_TAG]: 'Missing closing tag for <{0}>',
    [ErrorCode.UNEXPECTED_CLOSING_TAG]: 'Unexpected closing tag </{0}>',
    [ErrorCode.INVALID_DIRECTIVE_SYNTAX]: 'Invalid directive syntax: "{0}"',
    [ErrorCode.INVALID_FOR_SYNTAX]: 'Invalid f-for syntax: "{0}". Expected "(item, index) in source" or "item in source"',
    [ErrorCode.DUPLICATE_KEY]: 'Duplicate attribute "{0}" on element <{1}>',
    [ErrorCode.V_ELSE_NO_IF]: 'f-else / f-else-if has no matching f-if',
    [ErrorCode.EMPTY_EXPRESSION]: 'Expression in "{0}" must not be empty',
    [ErrorCode.INVALID_SLOT_NAME]: 'Invalid slot name "{0}"',
    [ErrorCode.DUPLICATE_DIRECTIVE]: 'Duplicate directive "f-{0}" on element <{1}>',
    [ErrorCode.FOR_MISSING_KEY]: 'f-for on <{0}> is missing a :key binding — add :key="<unique expr>"',
    [ErrorCode.MODEL_ON_NON_INPUT]: 'f-model can only be used on <input>, <textarea> or <select>, got <{0}>',
    [ErrorCode.COMPONENT_NOT_REGISTERED]: 'Component "{0}" is used in the template but not registered',
    [ErrorCode.UNKNOWN_NODE_TYPE]: 'Unknown AST node type "{0}" encountered in generator',
    [ErrorCode.UNKNOWN_IDENTIFIER]: 'Unknown identifier "{0}" in expression "{1}" — not found in component scope',
    [ErrorCode.STATIC_FOR_KEY]: ':key="{0}" is a static literal — keys must be unique per item (use a dynamic expression like :key="item.id")',
}

export class CompileError extends Error {
    constructor(code, loc, source, ...args) {
        const template = ERROR_MESSAGES[code] ?? `Unknown compiler error (${code})`
        const message  = _interpolate(template, args)
        super(message)
        this.name = 'CompileError'
        this.code = code
        this.loc = loc
        this.source = source
        this._snippet = null
    }

    format(filePath = '<template>') {
        const { line, col } = this.loc?.start ?? { line: '?', col: '?' }
        const header = `[fusée] ${this.name} ${this.code} at ${filePath}:${line}:${col}`
        const snippet = this._buildSnippet()
        return snippet ? `${header}\n${this.message}\n\n${snippet}` : `${header}\n${this.message}`
    }

    _buildSnippet() {
        if (this._snippet !== null) return this._snippet
        if (!this.source || !this.loc?.start) {
            this._snippet = ''
            return ''
        }

        const lines = this.source.split('\n')
        const lineIdx = this.loc.start.line - 1
        const col = this.loc.start.col
        const CONTEXT = 2
        const firstLine = Math.max(0, lineIdx - CONTEXT)
        const lastLine = Math.min(lines.length - 1, lineIdx + CONTEXT)
        const width = String(lastLine + 1).length
        const parts = []

        for (let i = firstLine; i <= lastLine; i++) {
            const lineNo = String(i + 1).padStart(width, ' ')
            const prefix = i === lineIdx ? '> ' : '  '
            parts.push(`${prefix}${lineNo} | ${lines[i]}`)
            if (i === lineIdx) {
                const caretPad = ' '.repeat(width + 4 + (col - 1))
                const caretLen = Math.max(1, (this.loc.end?.col ?? col) - col)
                parts.push(`${caretPad}${'~'.repeat(caretLen)}`)
            }
        }

        this._snippet = parts.join('\n')
        return this._snippet
    }
}

export class CompileWarning {
    constructor(code, loc, source, ...args) {
        const template = ERROR_MESSAGES[code] ?? `Unknown compiler warning (${code})`
        this.message = _interpolate(template, args)
        this.code = code
        this.loc = loc
        this.source = source
    }

    format(filePath = '<template>') {
        const { line, col } = this.loc?.start ?? { line: '?', col: '?' }
        return `[fusée] Warning ${this.code} at ${filePath}:${line}:${col}\n${this.message}`
    }
}

export class ErrorCollector {
    constructor(source) {
        this.source = source
        this.errors = []
        this.warnings = []
    }

    error(code, loc, ...args) {
        const err = new CompileError(code, loc, this.source, ...args)
        this.errors.push(err)
        return err
    }

    warn(code, loc, ...args) {
        const w = new CompileWarning(code, loc, this.source, ...args)
        this.warnings.push(w)
        return w
    }

    throwIfAny() {
        if (this.errors.length > 0) throw this.errors[0]
    }

    get hasErrors() {
        return this.errors.length > 0
    }

    get hasWarnings() {
        return this.warnings.length > 0
    }
}

function _interpolate(template, args) {
    return template.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '')
}

export function throwError(code, loc, source, ...args) {
    throw new CompileError(code, loc, source, ...args)
}
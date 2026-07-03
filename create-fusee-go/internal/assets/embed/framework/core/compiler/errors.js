import { ErrorCode, ERROR_MESSAGES } from './errors-list.js'

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
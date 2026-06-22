import { CompileError, ErrorCode, throwError } from './errors.js'
import { createPos, createLoc } from './ast.js'

export const TokenType = {
    TAG_OPEN: 'TAG_OPEN',
    TAG_OPEN_CLOSE: 'TAG_OPEN_CLOSE',
    TAG_CLOSE: 'TAG_CLOSE',
    TAG_SELF_CLOSE: 'TAG_SELF_CLOSE',
    COMMENT: 'COMMENT',
    ATTR_NAME: 'ATTR_NAME',
    ATTR_EQUALS: 'ATTR_EQUALS',
    ATTR_VALUE: 'ATTR_VALUE',
    TEXT: 'TEXT',
    MUSTACHE_OPEN: 'MUSTACHE_OPEN',
    MUSTACHE_EXPR: 'MUSTACHE_EXPR',
    MUSTACHE_CLOSE: 'MUSTACHE_CLOSE',
    EOF: 'EOF'
}

export function tokenize(source) {
    const lexer = new Lexer(source)
    return lexer.tokenize()
}

class Lexer {
    constructor(source) {
        this.source = source
        this.tokens = []
        this.pos = 0
        this.line = 1
        this.col = 1
        this._mode = 'text'
    }

    tokenize() {
        while (!this._eof()) {
            if (this._mode === 'text') {
                this._readText()
            } else if (this._mode === 'tag') {
                this._readInTag()
            }
        }
        this._push(TokenType.EOF, '', this._startPos())
        return this.tokens
    }

    _readText() {
        if (this._match('<!--')) {
            this._readComment()
            return
        }

        if (this._match('</')) {
            this._readClosingTag()
            return
        }

        if (this._peek() === '<' && this._isTagNameStart(this._peekAt(1))) {
            this._readOpenTag()
            return
        }

        if (this._match('{{')) {
            this._readMustache()
            return
        }

        const start = this._startPos()
        let text = ''
        while (!this._eof()) {
            if ((this._peek() === '<') || this._lookingAt('{{')) break
            text += this._advance()
        }

        if (text) this._push(TokenType.TEXT, text, start)
    }

    _readOpenTag() {
        const start = this._startPos()
        this._consume('<')
        const name = this._readTagName()
        this._pushAt(TokenType.TAG_OPEN, name, start)
        this._mode = 'tag'
    }

    _readClosingTag() {
        const start = this._startPos()
        this._consume('<')
        this._consume('/')
        const name = this._readTagName()
        this._pushAt(TokenType.TAG_OPEN_CLOSE, name, start)
        this._skipWhitespace()
        if (!this._eof() && this._peek() === '>') {
            this._consume('>')
            this._push(TokenType.TAG_CLOSE, '>', this._startPos())
        }
    }

    _readComment() {
        const start = this._startPos()
        this._consume('<!--')
        let content = ''
        while (!this._eof() && !this._lookingAt('-->')) {
            content += this._advance()
        }
        if (this._eof()) {
            throwError(ErrorCode.MALFORMED_COMMENT, createLoc(start, this._startPos()), this.source)
        }
        this._consume('-->')
        this._push(TokenType.COMMENT, content.trim(), start)
    }

    _readMustache() {
        const openStart = this._startPos()
        this._push(TokenType.MUSTACHE_OPEN, '{{', openStart)

        const exprStart = this._startPos()
        let expr = ''
        let depth = 0
        let inStr = false
        let strChar = null

        while (!this._eof()) {
            const ch = this._peek()

            if (inStr) {
                if (ch === '\\') {
                    expr += this._advance()
                    expr += this._advance()
                    continue
                }
                if (ch === strChar) {
                    inStr = false
                }
                expr += this._advance()
                continue
            }

            if (ch === '"' || ch === "'" || ch === '`') {
                inStr = true
                strChar = ch
                expr += this._advance()
                continue
            }
            if (ch === '{') {
                depth++;
                expr += this._advance()
                continue
            }
            if (ch === '}') {
                if (depth > 0) {
                    depth--
                    expr += this._advance()
                    continue
                }
                if (this._peekAt(1) === '}') {
                    this._push(TokenType.MUSTACHE_EXPR, expr.trim(), exprStart)
                    const closeStart = this._startPos()
                    this._consume('}}')
                    this._push(TokenType.MUSTACHE_CLOSE, '}}', closeStart)
                    return
                }
            }

            expr += this._advance()
        }

        throwError(ErrorCode.UNTERMINATED_MUSTACHE, createLoc(openStart, this._startPos()), this.source, expr)
    }

    _readInTag() {
        this._skipWhitespace()
        if (this._eof()) return

        if (this._match('/>')) {
            this._push(TokenType.TAG_SELF_CLOSE, '/>', this._startPos())
            this._mode = 'text'
            return
        }

        if (this._peek() === '>') {
            this._consume('>')
            this._push(TokenType.TAG_CLOSE, '>', this._startPos())
            this._mode = 'text'
            return
        }

        const start = this._startPos()
        const name = this._readAttrName()
        if (!name) return

        this._push(TokenType.ATTR_NAME, name, start)
        this._skipWhitespace()

        if (this._peek() === '=') {
            this._consume('=')
            this._push(TokenType.ATTR_EQUALS, '=', this._startPos())
            this._skipWhitespace()
            this._readAttrValue()
        }
    }

    _readAttrName() {
        let name = ''

        if (this._peek() === '@') {
            name += this._advance()
        }
        else if (this._peek() === ':') {
            name += this._advance()
        }

        while (!this._eof()) {
            const ch = this._peek()
            if (/[a-zA-Z0-9\-_.:]/.test(ch)) {
                name += this._advance()
            } 
            else 
                break
        }

        return name || null
    }

    _readAttrValue() {
        if (this._eof()) return
        const quote = this._peek()
        if (quote !== '"' && quote !== "'") {
            const start = this._startPos()
            let val = ''
            while (!this._eof() && !/[\s>]/.test(this._peek())) {
                val += this._advance()
            }
            this._push(TokenType.ATTR_VALUE, val, start)
            return
        }

        this._consume(quote)
        const start = this._startPos()
        let val = ''

        while (!this._eof()) {
            const ch = this._peek()
            if (ch === quote) {
                this._consume(quote)
                break
            }
            if (ch === '\\') {
                this._advance()
                val += this._advance()
                continue
            }
            val += this._advance()
        }

        this._push(TokenType.ATTR_VALUE, val, start)
    }

    _readTagName() {
        let name = ''
        while (!this._eof() && /[a-zA-Z0-9\-_.]/.test(this._peek())) {
            name += this._advance()
        }
        return name
    }

    _isTagNameStart(ch) {
        return ch != null && /[a-zA-Z_]/.test(ch)
    }

    _eof() {
        return this.pos >= this.source.length
    }

    _peek() {
        return this.source[this.pos]
    }

    _peekAt(n) {
        return this.source[this.pos + n]
    }

    _lookingAt(str) {
        return this.source.startsWith(str, this.pos)
    }

    _match(str) {
        if (this._lookingAt(str)) {
            for (const ch of str) 
                this._advance()
            return true
        }
        return false
    }

    _consume(expected) {
        for (const ch of expected) {
            if (this.source[this.pos] !== ch) {
                throwError(
                    ErrorCode.UNEXPECTED_CHAR,
                    createLoc(this._startPos(), this._startPos()),
                    this.source,
                    this.source[this.pos]
                )
            }
            this._advance()
        }
    }

    _advance() {
        const ch = this.source[this.pos++]
        if (ch === '\n') {
            this.line++;
            this.col = 1
        } 
        else {
            this.col++
        }
        return ch
    }

    _skipWhitespace() {
        while (!this._eof() && /\s/.test(this._peek())) this._advance()
    }

    _startPos() {
        return createPos(this.line, this.col, this.pos)
    }

    _push(type, value, start) {
        this.tokens.push({
            type,
            value,
            loc: createLoc(start, this._startPos(), value)
        })
    }

    _pushAt(type, value, start) {
        this._push(type, value, start)
    }
}
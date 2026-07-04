import { TokenType } from "./lexer.js";
import { ErrorCode } from "./errors-list.js";
import { throwError } from "./errors.js";
import {
    NodeType,
    createRoot,
    createElement,
    createComponent,
    createText,
    createInterpolation,
    createExpression,
    createAttribute,
    createBinding,
    createEvent,
    createDirective,
    createSlotOutlet,
    createSlotContent,
    createForArg,
    createLoc,
    createPos,
} from "./ast.js";

const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);
const FOR_RE =
    /^(?:\(\s*([^,)]+?)\s*(?:,\s*([^)]+?)\s*)?\))\s+in\s+(.+)$|^([^\s,]+)\s+in\s+(.+)$/;

export function parse(tokens, source, components = new Set()) {
    const parser = new Parser(tokens, source, components);
    return parser.parse();
}

class Parser {
    constructor(tokens, source, components) {
        this.tokens = tokens;
        this.source = source;
        this.components = components;
        this.pos = 0;
        this.stack = [];
    }

    parse() {
        const start = this._startLoc();
        const children = this._parseChildren(null);
        return createRoot(
            children,
            createLoc(start, this._startLoc(), this.source),
        );
    }

    _parseChildren(parentTag) {
        const children = [];

        while (!this._eof()) {
            const tok = this._peek();

            if (tok.type === TokenType.EOF) break;
            if (tok.type === TokenType.TAG_OPEN_CLOSE) break;

            if (tok.type === TokenType.COMMENT) {
                this._advance();
                continue;
            }

            if (tok.type === TokenType.TEXT) {
                children.push(this._parseText());
                continue;
            }

            if (tok.type === TokenType.MUSTACHE_OPEN) {
                children.push(this._parseMustache());
                continue;
            }

            if (tok.type === TokenType.TAG_OPEN) {
                const node = this._parseElement();
                if (node) children.push(node);
                continue;
            }

            this._advance();
        }

        return children;
    }

    _parseText() {
        const tok = this._consume(TokenType.TEXT);
        return createText(tok.value, tok.loc);
    }

    _parseMustache() {
        const open = this._consume(TokenType.MUSTACHE_OPEN);
        const expr = this._consume(TokenType.MUSTACHE_EXPR);
        const close = this._consume(TokenType.MUSTACHE_CLOSE);

        if (!expr.value.trim()) {
            throwError(
                ErrorCode.EMPTY_EXPRESSION,
                expr.loc,
                this.source,
                "{{ }}",
            );
        }

        const loc = createLoc(open.loc.start, close.loc.end);
        return createInterpolation(
            createExpression(expr.value, false, expr.loc),
            loc,
        );
    }

    _parseElement() {
        const openTok = this._consume(TokenType.TAG_OPEN);
        const tag = openTok.value;
        const startLoc = openTok.loc.start;
        const props = this._parseAttrs(tag);

        let selfClosing = false;
        if (this._peek()?.type === TokenType.TAG_SELF_CLOSE) {
            this._advance();
            selfClosing = true;
        } else {
            this._consume(TokenType.TAG_CLOSE);
        }

        if (tag === "slot") {
            return this._buildSlotOutlet(props, startLoc, selfClosing);
        }
        const slotAttr = props.find(
            (p) => p.type === NodeType.ATTRIBUTE && p.name === "slot",
        );
        if (tag === "template" && slotAttr) {
            return this._buildSlotContent(
                slotAttr,
                props,
                startLoc,
                selfClosing,
            );
        }

        if (selfClosing || VOID_ELEMENTS.has(tag.toLowerCase())) {
            return this._buildNode(tag, props, [], true, startLoc);
        }
        this.stack.push(tag);
        const children = this._parseChildren(tag);
        this.stack.pop();

        if (this._peek()?.type === TokenType.TAG_OPEN_CLOSE) {
            const closeTok = this._advance();
            if (closeTok.value.toLowerCase() !== tag.toLowerCase()) {
                throwError(
                    ErrorCode.UNEXPECTED_CLOSING_TAG,
                    closeTok.loc,
                    this.source,
                    closeTok.value,
                );
            }
            if (this._peek()?.type === TokenType.TAG_CLOSE) this._advance();
        } else {
            throwError(
                ErrorCode.MISSING_CLOSING_TAG,
                createLoc(startLoc, startLoc),
                this.source,
                tag,
            );
        }

        const endLoc = this._startLoc();
        return this._buildNode(tag, props, children, false, startLoc, endLoc);
    }

    _buildNode(tag, props, children, selfClosing, startLoc, endLoc = null) {
        const loc = createLoc(startLoc, endLoc ?? startLoc);

        if (this.components.has(tag) || /^[A-Z]/.test(tag)) {
            const slots = this._extractSlots(children);
            return createComponent(tag, props, slots, loc);
        }

        return createElement(tag, props, children, selfClosing, loc);
    }

    _buildSlotOutlet(props, startLoc, selfClosing) {
        const nameAttr = props.find(
            (p) => p.type === NodeType.ATTRIBUTE && p.name === "name",
        );
        const slotName = nameAttr?.value ?? "default";
        const passProps = props.filter((p) => p !== nameAttr);
        let fallback = [];
        if (!selfClosing) {
            this.stack.push("slot");
            fallback = this._parseChildren("slot");
            this.stack.pop();
            if (this._peek()?.type === TokenType.TAG_OPEN_CLOSE) {
                this._advance();
                if (this._peek()?.type === TokenType.TAG_CLOSE) 
                    this._advance();
            }
        }

        return createSlotOutlet(
            slotName,
            fallback,
            createLoc(startLoc, this._startLoc()),
            passProps,
        );
    }

    _buildSlotContent(slotAttr, props, startLoc, selfClosing) {
        const slotName = slotAttr.value ?? "default";
        const scopeAttr = props.find((p) => p.type === NodeType.ATTRIBUTE && p.name === "slot-scope");
        const slotProps = scopeAttr?.value ?? null;
        let children = [];

        if (!selfClosing) {
            this.stack.push("template");
            children = this._parseChildren("template");
            this.stack.pop();
            if (this._peek()?.type === TokenType.TAG_OPEN_CLOSE) {
                this._advance();
                if (this._peek()?.type === TokenType.TAG_CLOSE) this._advance();
            }
        }

        return createSlotContent(
            slotName,
            children,
            createLoc(startLoc, this._startLoc()),
            slotProps,
        );
    }

    _extractSlots(children) {
        const slots = { default: { children: [], slotProps: null } };

        for (const child of children) {
            if (child.type === NodeType.SLOT_CONTENT) {
                slots[child.slotName] = {
                    children: child.children,
                    slotProps: child.slotProps,
                };
            } else {
                slots.default.children.push(child);
            }
        }

        return slots;
    }

    _parseAttrs(tag) {
        const props = [];
        const seen = new Set();

        while (!this._eof()) {
            const tok = this._peek();
            if (
                tok.type === TokenType.TAG_CLOSE ||
                tok.type === TokenType.TAG_SELF_CLOSE ||
                tok.type === TokenType.EOF
            )
                break;

            if (tok.type !== TokenType.ATTR_NAME) {
                this._advance();
                continue;
            }

            const nameTok = this._advance();
            const rawName = nameTok.value;
            if (seen.has(rawName)) {
                throwError(
                    ErrorCode.DUPLICATE_KEY,
                    nameTok.loc,
                    this.source,
                    rawName,
                    tag,
                );
            }
            seen.add(rawName);

            let value = null;
            if (this._peek()?.type === TokenType.ATTR_EQUALS) {
                this._advance();
                const valTok = this._consume(TokenType.ATTR_VALUE);
                value = valTok.value;
            }

            const loc = nameTok.loc;

            if (rawName.startsWith("@")) {
                props.push(this._parseEventAttr(rawName, value, loc));
            } else if (rawName.startsWith(":")) {
                props.push(this._parseBindingAttr(rawName, value, loc));
            } else if (rawName.startsWith("f-")) {
                props.push(this._parseDirectiveAttr(rawName, value, loc, tag));
            } else {
                props.push(createAttribute(rawName, value, loc));
            }
        }

        return props;
    }

    _parseEventAttr(rawName, value, loc) {
        const rest = rawName.slice(1);
        const parts = rest.split(".");
        const eventName = parts[0];
        const modifiers = parts.slice(1);

        if (!value || !value.trim()) {
            throwError(ErrorCode.EMPTY_EXPRESSION, loc, this.source, rawName);
        }

        return createEvent(
            eventName,
            createExpression(value.trim(), false, loc),
            modifiers,
            loc,
        );
    }

    _parseBindingAttr(rawName, value, loc) {
        const name = rawName.slice(1);
        const isProp = name.startsWith("prop-");

        if (!value || !value.trim()) {
            throwError(ErrorCode.EMPTY_EXPRESSION, loc, this.source, rawName);
        }

        return createBinding(
            isProp ? name.slice(5) : name,
            createExpression(value.trim(), false, loc),
            isProp,
            loc,
        );
    }

    _parseDirectiveAttr(rawName, value, loc, tag) {
        const name = rawName.slice(2);
        const needsExpr = !["else", "once"].includes(name);

        if (needsExpr && (!value || !value.trim())) {
            throwError(ErrorCode.EMPTY_EXPRESSION, loc, this.source, rawName);
        }

        let expression = null;
        let arg = null;

        if (value) {
            if (name === "for") {
                arg = this._parseForExpression(value.trim(), loc);
            } else {
                expression = createExpression(value.trim(), false, loc);
            }
        }

        return createDirective(name, expression, arg, loc);
    }

    _parseForExpression(raw, loc) {
        const m = FOR_RE.exec(raw);
        if (!m) {
            throwError(ErrorCode.INVALID_FOR_SYNTAX, loc, this.source, raw);
        }

        const item = (m[1] ?? m[4]).trim();
        const index = m[2] ? m[2].trim() : null;
        const source = (m[3] ?? m[5]).trim();

        return createForArg(item, source, index, loc);
    }

    _eof() {
        return (
            this.pos >= this.tokens.length ||
            this._peek()?.type === TokenType.EOF
        );
    }

    _peek() {
        return this.tokens[this.pos];
    }

    _advance() {
        const tok = this.tokens[this.pos];
        if (tok?.type !== TokenType.EOF) this.pos++;
        return tok;
    }

    _consume(expectedType) {
        const tok = this._peek();
        if (!tok || tok.type !== expectedType) {
            throwError(
                ErrorCode.UNEXPECTED_TOKEN,
                tok?.loc ?? createLoc(this._startLoc(), this._startLoc()),
                this.source,
                tok?.type ?? "EOF",
                expectedType,
            );
        }
        return this._advance();
    }

    _startLoc() {
        const tok = this._peek();
        return tok?.loc?.start ?? createPos(0, 0, 0);
    }
}
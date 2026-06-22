import {NodeType, createExpression, isDirective, findDirective, isStaticText, cloneNode,} from './ast.js'
import { ErrorCode, CompileWarning } from './errors.js'

export function transform(ast, options = {}) {
    const ctx = {
        components: options.components ?? new Set(),
        source: options.source ?? '',
        hoisted: [],
        warnings: [],
        scope: new Set(options.scope ?? []),
        scopeStack: [],
    }

    markStaticPass(ast, ctx)
    walkChildren(ast, node => {
        if (node.children) chainConditionalsInChildren(node.children, ctx)
    })

    walkChildren(ast, node => {
        validateFor(node, ctx)
        validateModel(node, ctx)
        validateComponents(node, ctx)
    })

    if (ctx.scope.size > 0) {
        analyseScope(ast, ctx, new Set(ctx.scope))
    }

    ast._hoisted = ctx.hoisted

    return { ast, warnings: ctx.warnings }
}

// Step 1 & 2: static marking + hoisting

function markStaticPass(node, ctx) {
    if (!node) return false

    if (node.type === NodeType.TEXT) {
        node.isStatic = true
        return true
    }

    if (node.type === NodeType.EXPRESSION) {
        node.isStatic = isLiteralExpression(node.content)
        return node.isStatic
    }

    if (node.type === NodeType.INTERPOLATION) {
        node.isStatic = markStaticPass(node.expression, ctx)
        return node.isStatic
    }

    if (node.type === NodeType.ELEMENT) {
        const hasOnce = node.props.some(p => isDirective(p, 'once'))
        if (hasOnce) {
            node.isStatic = true
            node.hoisted  = true
            ctx.hoisted.push(node)
            return true
        }

        const hasDynamic = node.props.some(p => p.type === NodeType.DIRECTIVE || p.type === NodeType.BINDING || p.type === NodeType.EVENT)

        if (hasDynamic) {
            node.isStatic = false
            if (node.children) node.children.forEach(c => markStaticPass(c, ctx))
            return false
        }

        const hasInterpolatedAttr = node.props.some(p => p.type === NodeType.ATTRIBUTE && typeof p.value === 'string' && p.value.includes('{{'))
        if (hasInterpolatedAttr) {
            node.isStatic = false
            if (node.children) node.children.forEach(c => markStaticPass(c, ctx))
            return false
        }

        const childrenStatic = node.children ? node.children.every(c => markStaticPass(c, ctx)) : true

        node.isStatic = childrenStatic

        if (node.isStatic && node.children && node.children.length >= 2) {
            node.hoisted = true
            ctx.hoisted.push(node)
        }

        return node.isStatic
    }

    if (node.type === NodeType.COMPONENT) {
        node.isStatic = false
        if (node.slots) {
            for (const slotChildren of Object.values(node.slots)) {
                if (Array.isArray(slotChildren)) 
                    slotChildren.forEach(c => markStaticPass(c, ctx))
            }
        }
        return false
    }

    if (node.type === NodeType.ROOT) {
        if (node.children) node.children.forEach(c => markStaticPass(c, ctx))
        return false
    }

    return false
}

// Step 3: chain f-if / f-else-if / f-else

function chainConditionalsInChildren(children, ctx) {
    for (let i = 0; i < children.length; i++) {
        const node = children[i]
        if (!isElementOrComponent(node)) continue

        const ifDir = findDirective(node, 'if')
        if (!ifDir) {
            const elseDir = findDirective(node, 'else') ?? findDirective(node, 'else-if')
            if (elseDir) {
                ctx.warnings.push(new CompileWarning(ErrorCode.V_ELSE_NO_IF, elseDir.loc, ctx.source))
            }
            continue
        }

        const branches = [{ condition: ifDir.expression, node }]
        let j = i + 1

        while (j < children.length) {
            const next = children[j]
            if (!isElementOrComponent(next)) break

            const elseIfDir = findDirective(next, 'else-if')
            const elseDir = findDirective(next, 'else')

            if (elseIfDir) {
                branches.push({ condition: elseIfDir.expression, node: next })
                j++
            } else if (elseDir) {
                branches.push({ condition: null, node: next })
                j++
                break
            } else {
                break
            }
        }

        const ifNode = {
            type: 'If',
            branches,
            loc: node.loc,
            isStatic: false,
        }

        children.splice(i, j - i, ifNode)
    }
}

// Step 4: f-for :key validation

function validateFor(node, ctx) {
    if (node.type !== NodeType.ELEMENT && node.type !== NodeType.COMPONENT) return

    const forDir = findDirective(node, 'for')
    if (!forDir) return

    const hasKey = node.props.some(p => p.type === NodeType.BINDING && p.name === 'key')
    if (!hasKey) {
        ctx.warnings.push(new CompileWarning(ErrorCode.FOR_MISSING_KEY, forDir.loc, ctx.source, node.tag ?? node.name))
    }
}

// Step 5: f-model element validation

const MODEL_ALLOWED = new Set(['input', 'textarea', 'select'])

function validateModel(node, ctx) {
    if (node.type !== NodeType.ELEMENT) return
    const modelDir = findDirective(node, 'model')
    if (!modelDir) return
    if (!MODEL_ALLOWED.has(node.tag.toLowerCase())) {
        ctx.warnings.push(new CompileWarning(ErrorCode.MODEL_ON_NON_INPUT, modelDir.loc, ctx.source, node.tag))
    }
}

// Step 6: component registration validation

function validateComponents(node, ctx) {
    if (node.type !== NodeType.COMPONENT) return
    if (!ctx.components.has(node.name)) {
        ctx.warnings.push(new CompileWarning(ErrorCode.COMPONENT_NOT_REGISTERED, node.loc, ctx.source, node.name))
    }
}

// ─── Step 7 & 8: Semantic analysis — scope + expression validation ────────────

function analyseScope(node, ctx, localScope) {
    if (!node) return

    switch (node.type) {
        case NodeType.ROOT:
            for (const child of node.children ?? []) {
                analyseScope(child, ctx, localScope)
            }
            break

        case NodeType.ELEMENT:
        case NodeType.COMPONENT: {
            const forDir = findDirective(node, 'for')
            const childScope = forDir ? _extendScopeFromFor(localScope, forDir.arg) : localScope

            for (const prop of node.props ?? []) {
                _validateProp(prop, ctx, childScope)
            }

            for (const child of node.children ?? []) {
                analyseScope(child, ctx, childScope)
            }

            if (node.slots) {
                for (const slotChildren of Object.values(node.slots)) {
                    if (Array.isArray(slotChildren)) {
                        for (const c of slotChildren) 
                            analyseScope(c, ctx, childScope)
                    }
                }
            }
            break
        }

        case NodeType.INTERPOLATION:
            _validateExpression(node.expression, ctx, localScope)
            break

        case 'If':
            for (const branch of node.branches ?? []) {
                if (branch.condition) _validateExpression(branch.condition, ctx, localScope)
                analyseScope(branch.node, ctx, localScope)
            }
            break

        case NodeType.TEXT:
        case NodeType.EXPRESSION:
        case NodeType.SLOT_OUTLET:
        case NodeType.SLOT_CONTENT:
            break
    }
}

function _validateProp(prop, ctx, scope) {
    switch (prop.type) {
        case NodeType.BINDING:
            _validateExpression(prop.expression, ctx, scope)
            break

        case NodeType.EVENT:
            _validateExpression(prop.expression, ctx, scope, { isHandler: true })
            break

        case NodeType.DIRECTIVE:
            if (prop.name === 'for')
                break
            if (prop.expression)
                _validateExpression(prop.expression, ctx, scope)
            break

        case NodeType.ATTRIBUTE:
            break
    }
}

function _validateExpression(exprNode, ctx, scope, opts = {}) {
    if (!exprNode || !exprNode.content) return
    if (exprNode.isStatic) return

    const raw = exprNode.content.trim()
    if (!raw) return

    const identifiers = _extractIdentifiers(raw)

    for (const id of identifiers) {
        if (JS_GLOBALS.has(id)) continue
        if (opts.isHandler && id === '$event') continue

        if (!scope.has(id)) {
            ctx.warnings.push(new CompileWarning(
                ErrorCode.UNKNOWN_IDENTIFIER,
                exprNode.loc,
                ctx.source,
                id,
                raw
            ))
        }
    }

    if (exprNode._isForKey && isLiteralExpression(raw)) {
        ctx.warnings.push(new CompileWarning(
            ErrorCode.STATIC_FOR_KEY,
            exprNode.loc,
            ctx.source,
            raw
        ))
    }
}

function _extractIdentifiers(expr) {
    const stripped = expr
        .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, '""')
        .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
        .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '""')

    const found = new Set()
    const RE = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
    let m

    while ((m = RE.exec(stripped)) !== null) {
        const id  = m[1]
        const idx = m.index

        if (JS_KEYWORDS.has(id)) continue
        if (idx > 0 && stripped[idx - 1] === '.') continue

        found.add(id)
    }

    return found
}

function _extendScopeFromFor(parentScope, forArg) {
    if (!forArg) 
        return parentScope
        
    const extended = new Set(parentScope)
    
    if (forArg.item)  
        extended.add(forArg.item)
    if (forArg.index) 
        extended.add(forArg.index)

    return extended
}

const JS_GLOBALS = new Set([
    'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 
    'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef',
    'Promise', 'Proxy', 'Reflect', 'JSON', 'Error', 'TypeError',
    'RangeError', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
    'console', 'window', 'document', 'globalThis', 'undefined', 'null',
    'Infinity', 'NaN', 'setTimeout', 'clearTimeout', 'setInterval',
    'clearInterval', 'queueMicrotask', 'fetch', 'true', 'false'
])

const JS_KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
    'continue', 'return', 'throw', 'try', 'catch', 'finally',
    'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'void',
    'const', 'let', 'var', 'function', 'class', 'import', 'export',
    'default', 'extends', 'super', 'this', 'yield', 'await', 'async',
    'true', 'false', 'null', 'undefined'
])

function walkChildren(node, visitor) {
    if (!node) return
    visitor(node)

    if (node.children) {
        for (const child of node.children) 
            walkChildren(child, visitor)
    }

    if (node.branches) {
        for (const branch of node.branches) 
            walkChildren(branch.node, visitor)
    }

    if (node.slots) {
        for (const slotChildren of Object.values(node.slots)) {
            if (Array.isArray(slotChildren)) {
                for (const c of slotChildren) 
                    walkChildren(c, visitor)
            }
        }
    }
}

function isElementOrComponent(node) {
    return node?.type === NodeType.ELEMENT || node?.type === NodeType.COMPONENT
}

const LITERAL_RE = /^(?:true|false|null|undefined|-?\d[\d._]*(?:n)?|'[^']*'|"[^"]*"|`[^`]*`)$/

function isLiteralExpression(expr) {
    return LITERAL_RE.test(expr.trim())
}
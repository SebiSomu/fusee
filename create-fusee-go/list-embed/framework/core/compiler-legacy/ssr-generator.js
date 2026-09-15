import { NodeType } from './ast.js'
import { ErrorCode } from './errors-list.js'
import { throwError } from './errors.js'
import { ExprScope } from './expr-utils.js'

const SSR_RUNTIME = 'fusee/runtime/ssr.js'
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

export function generateSSR(ast, options = {}) {
    return new SSRGenerator(ast, options).generate()
}

class SSRGenerator {
    constructor(ast, options) {
        this.ast = ast
        this.source = options.source ?? ''
        this.runtimePath = options.runtimePath ?? SSR_RUNTIME
        this.scope = new ExprScope()
        this._anchorIdx = 0
        this._imports = new Set(['escapeHtml', 'escapeAttr', 'renderClass', 'renderStyle', 'ssrEnumerate', 'renderComponentSSR', 'ssrVal'])
        this._hoistedMap = new Map()
        this._hoistedIdx = 0
    }

    generate() {
        if (this.ast._hoisted) {
            for (const node of this.ast._hoisted) {
                this._hoistedMap.set(node, `_ss${this._hoistedIdx++}`)
            }
        }

        const body = [`let __html = ''`]
        this._emitChildren(this.ast.children, body)
        body.push('return __html')

        const hoistedDecls = []
        for (const [node, name] of this._hoistedMap) {
            const stmts = [`let __h = ''`]
            this._emitNode(node, stmts, '__h', true)
            stmts.push('return __h')
            hoistedDecls.push(`const ${name} = (() => {\n    ${stmts.join('\n    ')}\n})()`)
        }

        return [
            `import { ${[...this._imports].join(', ')} } from '${this.runtimePath}'`,
            '',
            ...(hoistedDecls.length ? [...hoistedDecls, ''] : []),
            `export async function renderSSR(_ctx, _components) {`,
            ...body.map(l => `    ${l}`),
            `}`
        ].join('\n')
    }

    _emitChildren(children, out, varName = '__html') {
        if (!children) return
        for (const child of children) {
            const forDir = child.props?.find?.(p => p.type === NodeType.DIRECTIVE && p.name === 'for')
            if (forDir) this._emitForNode(child, forDir, out, varName)
            else this._emitNode(child, out, varName)
        }
    }

    _emitNode(node, out, varName, inHoist = false) {
        if (!inHoist && this._hoistedMap.has(node)) {
            out.push(`${varName} += ${this._hoistedMap.get(node)}`)
            return
        }
        switch (node.type) {
            case NodeType.TEXT: return this._emitText(node, out, varName)
            case NodeType.INTERPOLATION: return this._emitInterpolation(node, out, varName)
            case NodeType.ELEMENT: return this._emitElement(node, out, varName)
            case NodeType.COMPONENT: return this._emitComponent(node, out, varName)
            case NodeType.SLOT_OUTLET: return this._emitSlotOutlet(node, out, varName)
            case 'If': return this._emitIf(node, out, varName)
            default: throwError(ErrorCode.UNKNOWN_NODE_TYPE, node.loc, this.source, node.type)
        }
    }

    _emitText(node, out, varName) {
        out.push(`${varName} += ${JSON.stringify(node.content)}`)
    }

    _emitInterpolation(node, out, varName) {
        const expr = node.expression.content
        if (node.expression.isStatic) {
            out.push(`${varName} += escapeHtml(String(${expr}))`)
            return
        }
        const id = this._anchorIdx++
        const wrapped = this.scope.wrap(expr)
        out.push(`${varName} += '<!--f-bind:${id}-->' + escapeHtml(String(${wrapped})) + '<!--/f-bind:${id}-->'`)
    }

    _emitElement(node, out, varName) {
        const tag = node.tag
        const isVoid = node.selfClosing || VOID_ELEMENTS.has(tag.toLowerCase())
        const htmlDir = node.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'html')
        const needsAnchor = node.props.some(p =>
            p.type === NodeType.BINDING || p.type === NodeType.EVENT ||
            (p.type === NodeType.DIRECTIVE && !['if', 'else-if', 'else', 'for'].includes(p.name))
        )
        const anchorId = needsAnchor ? this._anchorIdx++ : null

        out.push(`${varName} += '<${tag}'`)
        this._emitAttrs(node.props, out, varName)
        if (anchorId !== null) out.push(`${varName} += ' data-f-id="${anchorId}"'`)
        out.push(`${varName} += '${isVoid ? '/>' : '>'}'`)
        if (isVoid) return

        if (htmlDir) {
            const expr = this.scope.wrap(htmlDir.expression.content)
            out.push(`${varName} += String(${expr})`) // intentionally unescaped, per f-html semantics
        } else {
            this._emitChildren(node.children, out, varName)
        }
        out.push(`${varName} += '</${tag}>'`)
    }

    _emitAttrs(props, out, varName) {
        for (const prop of props) {
            if (prop.type === NodeType.ATTRIBUTE) this._emitStaticAttr(prop, out, varName)
            else if (prop.type === NodeType.BINDING) this._emitBindingAttr(prop, out, varName)
            else if (prop.type === NodeType.DIRECTIVE) this._emitDirectiveAttr(prop, out, varName)
            // EVENT: nothing to render server-side; hydration binds via data-f-id
        }
    }

    _emitStaticAttr(prop, out, varName) {
        if (prop.value === null) {
            out.push(`${varName} += ' ${prop.name}'`)
        } else {
            out.push(`${varName} += ' ${prop.name}="' + escapeAttr(${JSON.stringify(prop.value)}) + '"'`)
        }
    }

    _emitBindingAttr(prop, out, varName) {
        const expr = this.scope.wrap(prop.expression.content)
        if (prop.isProp) return // DOM-only property, no HTML attribute equivalent
        if (prop.name === 'class') {
            out.push(`${varName} += ' class="' + escapeAttr(renderClass(${expr})) + '"'`)
        } else if (prop.name === 'style') {
            out.push(`${varName} += ' style="' + escapeAttr(renderStyle(${expr})) + '"'`)
        } else {
            out.push(`${varName} += (function(v){ if (v === false || v == null) return ''; if (v === true) return ' ${prop.name}'; return ' ${prop.name}="' + escapeAttr(String(v)) + '"' })(${expr})`)
        }
    }

    _emitDirectiveAttr(dir, out, varName) {
        switch (dir.name) {
            case 'show': {
                const expr = this.scope.wrap(dir.expression.content)
                out.push(`${varName} += (${expr}) ? '' : ' style="display:none"'`)
                break
            }
            case 'model': {
                const expr = this.scope.wrap(dir.expression.content)
                out.push(`${varName} += ' value="' + escapeAttr(String(${expr} ?? '')) + '"'`)
                break
            }
            // if/else-if/else/for handled structurally; html handled in _emitElement; ref/once are client-only
        }
    }

    _emitIf(node, out, varName) {
        const id = this._anchorIdx++
        out.push(`${varName} += '<!--f-if:${id}-->'`)
        node.branches.forEach((branch, i) => {
            const stmts = []
            this._emitNode(branch.node, stmts, varName)
            const block = stmts.map(s => '    ' + s).join('\n')
            if (branch.condition) {
                const cond = this.scope.wrap(branch.condition.content)
                out.push(`${i === 0 ? 'if' : 'else if'} (${cond}) {\n${block}\n}`)
            } else {
                out.push(`else {\n${block}\n}`)
            }
        })
        out.push(`${varName} += '<!--/f-if:${id}-->'`)
    }

    _emitForNode(node, forDir, out, varName) {
        const id = this._anchorIdx++
        const { item, source, index } = forDir.arg
        const sourceExpr = this.scope.wrap(source)

        this.scope.push([item, index])
        const innerProps = node.props.filter(p => !(p.type === NodeType.DIRECTIVE && p.name === 'for'))
        const innerNode = { ...node, props: innerProps }
        const keyBinding = innerProps.find(p => p.type === NodeType.BINDING && p.name === 'key')
        const keyExpr = keyBinding ? this.scope.wrap(keyBinding.expression.content) : 'undefined'
        const itemParam = index ? `${item}, ${index}` : item

        const innerStmts = []
        this._emitNode(innerNode, innerStmts, varName)
        this.scope.pop()

        out.push(`${varName} += '<!--f-for:${id}-->'`)
        out.push(`for (const [${itemParam}] of ssrEnumerate(${sourceExpr})) {`)
        out.push(`    const __key${id} = ${keyExpr}`)
        out.push(`    ${varName} += '<!--f-for-item:${id}:' + escapeAttr(String(__key${id})) + '-->'`)
        innerStmts.forEach(s => out.push('    ' + s))
        out.push(`    ${varName} += '<!--/f-for-item:${id}-->'`)
        out.push(`}`)
        out.push(`${varName} += '<!--/f-for:${id}-->'`)
    }

    _emitComponent(node, out, varName) {
        const id = this._anchorIdx++
        const name = JSON.stringify(node.name)
        const props = this._buildComponentPropsObj(node.props)
        const slots = this._buildSlotsObj(node.slots)
        out.push(`${varName} += '<!--f-component:${node.name}:${id}-->'`)
        out.push(`${varName} += await renderComponentSSR(_components[${name}], ${props}, ${slots}, ${JSON.stringify(String(id))})`)
        out.push(`${varName} += '<!--/f-component:${id}-->'`)
    }

    _buildComponentPropsObj(props) {
        const entries = props
            .filter(p => p.type === NodeType.ATTRIBUTE || p.type === NodeType.BINDING)
            .map(p => p.type === NodeType.ATTRIBUTE
                ? `${JSON.stringify(p.name)}: ${JSON.stringify(p.value ?? true)}`
                : `${JSON.stringify(p.name)}: ${this.scope.wrap(p.expression.content)}`)
        return `{ ${entries.join(', ')} }`
    }

    _buildSlotsObj(slots) {
        if (!slots || Object.keys(slots).length === 0) return '{}'
        const entries = Object.entries(slots).map(([name, children]) => {
            const stmts = [`let __s = ''`]
            this._emitChildren(children, stmts, '__s')
            stmts.push('return __s')
            return `${JSON.stringify(name)}: () => {\n        ${stmts.join('\n        ')}\n    }`
        })
        return `{ ${entries.join(', ')} }`
    }

    _emitSlotOutlet(node, out, varName) {
        const id = this._anchorIdx++
        const name = JSON.stringify(node.slotName)
        const fallbackStmts = [`let __f = ''`]
        this._emitChildren(node.fallback, fallbackStmts, '__f')
        out.push(`${varName} += '<!--f-slot:${id}-->'`)
        out.push(`${varName} += (_ctx._slots && _ctx._slots[${name}]) ? _ctx._slots[${name}]() : (() => { ${fallbackStmts.join('; ')}; return __f })()`)
        out.push(`${varName} += '<!--/f-slot:${id}-->'`)
    }
}
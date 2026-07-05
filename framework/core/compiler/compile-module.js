import { parse } from 'acorn'
import { ancestor as walkAncestor } from 'acorn-walk'
import MagicString from 'magic-string'

const RUNE_TO_RUNTIME = {
    signal: 'signal',
    computed: 'computed',
    effect: 'effect',
    watch: 'watch',
    batch: 'batch',
    untrack: 'untrack',
    resource: 'resource',
    provide: 'provide',
    inject: 'inject',
}

export function compileModule(source, options = {}) {
    const filename = options.filename ?? '<module>'

    let ast
    try {
        ast = parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true,
        })
    } catch (err) {
        throw new Error(`[fusée] Failed to parse script in ${filename}: ${err.message}`)
    }

    const s = new MagicString(source)
    const runes = new Map()
    const warnings = []

    collectRuneDeclarations(ast, runes, warnings)
    rewriteRuneDeclarations(ast, s, runes)
    rewriteRuneUsages(ast, s, runes, warnings)

    const usedRuntimeHelpers = [...new Set([...runes.values()].map(r => RUNE_TO_RUNTIME[r.kind]))]

    return {
        code: s.toString(),
        map: s.generateMap({ hires: true }),
        runes,
        warnings,
        runtimeImports: usedRuntimeHelpers,
    }
}

function collectRuneDeclarations(ast, runes, warnings) {
    walkAncestor(ast, {
        VariableDeclarator(node) {
            const rune = matchRuneCall(node.init)
            if (!rune) return

            if (node.id.type !== 'Identifier') {
                warnings.push(`Destructuring a rune declaration ("${rune.kind}") is not supported yet — skipping.`)
                return
            }

            if (runes.has(node.id.name)) {
                warnings.push(`Duplicate rune identifier "${node.id.name}" — the first declaration wins.`)
                return
            }

            runes.set(node.id.name, {
                kind: rune.kind,
                callNode: node.init,
                declaratorNode: node,
            })
        },

        ExpressionStatement(node) {
            const rune = matchRuneCall(node.expression)
            if (rune) {
                runes.set(node.expression, { kind: rune.kind, callNode: node.expression, bare: true })
            }
        },
    })
}

function matchRuneCall(node) {
    if (!node || node.type !== 'CallExpression') return null
    if (node.callee.type !== 'Identifier') return null
    const name = node.callee.name
    if (!name.startsWith('$')) return null
    const kind = name.slice(1)
    if (!(kind in RUNE_TO_RUNTIME)) return null
    return { kind }
}

function rewriteRuneDeclarations(ast, s, runes) {
    for (const [name, entry] of runes) {
        if (entry.bare) {
            const callee = entry.callNode.callee
            s.overwrite(callee.start, callee.end, RUNE_TO_RUNTIME[entry.kind])
            continue
        }

        const callee = entry.callNode.callee
        const runtimeName = RUNE_TO_RUNTIME[entry.kind]
        s.overwrite(callee.start, callee.end, runtimeName)

        if (entry.kind === 'computed') {
            const arg = entry.callNode.arguments[0]
            if (arg && arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression') {
                s.appendLeft(arg.start, '() => ')
            }
        }

        const decl = findParentVariableDeclaration(ast, entry.declaratorNode)
        if (decl && decl.declarations.length === 1 && decl.kind !== 'const') {
            s.overwrite(decl.start, decl.start + decl.kind.length, 'const')
        }
    }
}

function findParentVariableDeclaration(ast, declaratorNode) {
    let found = null
    walkAncestor(ast, {
        VariableDeclaration(node) {
            if (node.declarations.includes(declaratorNode)) found = node
        },
    })
    return found
}

function isShadowed(name, ancestors, ownDeclaratorNode) {
    for (let i = ancestors.length - 2; i >= 0; i--) {
        if (scopeDeclares(ancestors[i], name, ownDeclaratorNode)) return true
    }
    return false
}

function scopeDeclares(scopeNode, name, ownDeclaratorNode) {
    switch (scopeNode.type) {
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
            return scopeNode.params.some(p => bindingDeclares(p, name))
        case 'CatchClause':
            return !!scopeNode.param && bindingDeclares(scopeNode.param, name)
        case 'BlockStatement':
        case 'Program':
            return (scopeNode.body ?? []).some(stmt => statementDeclares(stmt, name, ownDeclaratorNode))
        case 'ForStatement':
            return scopeNode.init?.type === 'VariableDeclaration' && declarationDeclares(scopeNode.init, name, ownDeclaratorNode)
        case 'ForInStatement':
        case 'ForOfStatement':
            return scopeNode.left?.type === 'VariableDeclaration' && declarationDeclares(scopeNode.left, name, ownDeclaratorNode)
        default:
            return false
    }
}

function statementDeclares(stmt, name, ownDeclaratorNode) {
    if (!stmt) return false
    if (stmt.type === 'VariableDeclaration') return declarationDeclares(stmt, name, ownDeclaratorNode)
    if (stmt.type === 'FunctionDeclaration' && stmt.id) return stmt.id.name === name
    if (stmt.type === 'ClassDeclaration' && stmt.id) return stmt.id.name === name
    return false
}

function declarationDeclares(varDecl, name, ownDeclaratorNode) {
    return varDecl.declarations.some(d => d !== ownDeclaratorNode && bindingDeclares(d.id, name))
}

function bindingDeclares(pattern, name) {
    if (!pattern) return false
    switch (pattern.type) {
        case 'Identifier': return pattern.name === name
        case 'AssignmentPattern': return bindingDeclares(pattern.left, name)
        case 'RestElement': return bindingDeclares(pattern.argument, name)
        case 'ObjectPattern':
            return pattern.properties.some(p =>
                p.type === 'RestElement' ? bindingDeclares(p.argument, name) : bindingDeclares(p.value, name))
        case 'ArrayPattern':
            return pattern.elements.some(el => el && bindingDeclares(el, name))
        default: return false
    }
}

function rewriteRuneUsages(ast, s, runes, warnings) {
    const visitOccurrence = (node, ancestors) => {
        if (!runes.has(node.name)) return
        const runeEntry = runes.get(node.name)
        const parent = ancestors[ancestors.length - 2]
        if (!parent) return
        if (parent.type === 'VariableDeclarator' && parent.id === node) return
        if (isShadowed(node.name, ancestors, runeEntry.declaratorNode)) return
        if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return
        if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return
        if (parent.type === 'ObjectPattern' || parent.type === 'ArrayPattern') {
            warnings.push(`Cannot use rune "${node.name}" as a destructuring target — skipping.`)
            return
        }

        if (((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') && parent.params.includes(node)) || (parent.type === 'CatchClause' && parent.param === node)) {
            return
        }
        let inReturnStatement = false
        let inObjectLiteralValue = false

        for (let i = ancestors.length - 1; i >= 0; i--) {
            const ancestor = ancestors[i]
            if (ancestor.type === 'ReturnStatement') {
                inReturnStatement = true
                break
            }
            if (ancestor.type === 'Property' && ancestor.value === node) {
                inObjectLiteralValue = true
                break
            }
            
            if (ancestor.type === 'Property' && ancestor.shorthand && ancestor.key === node) {
                inObjectLiteralValue = true
                break
            }
            if (ancestor.type === 'ArrayExpression' && ancestor.elements.includes(node)) {
                inObjectLiteralValue = true
                break
            }
        }

        if (inReturnStatement || inObjectLiteralValue) {
            let isAssignmentLeft = false
            for (let i = ancestors.length - 1; i >= 0; i--) {
                const ancestor = ancestors[i]
                if (ancestor.type === 'AssignmentExpression' && ancestor.left === node) {
                    isAssignmentLeft = true
                    break
                }
            }
            if (!isAssignmentLeft) {
                return
            }
        }

        if (parent.type === 'Property' && parent.shorthand) {
            s.overwrite(node.start, node.end, `${node.name}: ${node.name}()`)
            return
        }

        if (['signal', 'resource'].includes(runeEntry.kind)) {
            if (parent.type === 'AssignmentExpression' && parent.left === node) {
                if (parent.operator === '=') {
                    s.overwrite(node.start, parent.right.start, `${node.name}(`)
                } else {
                    const op = parent.operator.slice(0, -1)
                    s.overwrite(node.start, parent.right.start, `${node.name}(${node.name}() ${op} `)
                }
                s.appendRight(parent.end, ')')
                return
            }

            if (parent.type === 'UpdateExpression' && parent.argument === node) {
                const op = parent.operator[0]
                s.overwrite(parent.start, parent.end, `${node.name}(${node.name}() ${op} 1)`)
                return
            }

            s.appendLeft(node.end, '()')
        }
    }

    walkAncestor(ast, {
        Identifier: visitOccurrence,
        VariablePattern: visitOccurrence,
    })
}

// a custom Babel plugin that replaces the
// standard automatic-JSX transform with one that understands fusee's
// reactivity contract.
//
// The structural half (tag dispatch, event-prop naming, slot splitting)
// stays in jsx-runtime.js — this plugin's only extra job is
// deciding, per attribute and per child, whether the expression should be
// evaluated eagerly (static) or wrapped in `() => expr` so h.js's
// effect-wrapping (_applyProps, hText) picks it up as reactive.
//
// Usage (babel.config.js):
//   module.exports = {
//     plugins: [
//       '@babel/plugin-syntax-jsx',
//       '@babel/plugin-syntax-typescript', // if using .tsx, with { isTSX: true }
//       ['./babel-plugin-fusee-jsx.js', { importSource: './jsx-runtime.js' }]
//     ]
//   }

const OPAQUE_ATTR_NAMES = new Set(['f-show', 'f-html', 'f-model', 'f-ref', 'f-once', 'key'])

function isEventPropName(name) {
    return /^on[A-Z]/.test(name)
}

function isOpaqueAttrName(name) {
    return OPAQUE_ATTR_NAMES.has(name) || isEventPropName(name)
}

/** True for expressions whose value can never change, so wrapping would be pure overhead. */
function isStaticExpression(t, node) {
    if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)) {
        return true
    }
    if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
        return true
    }
    return false
}

/** True for expressions that are already a function — an event handler, or a render-prop for For/Show/Slot. Never double-wrap these. */
function isAlreadyFunction(t, node) {
    return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)
}

/**
 * A bare identifier (`isActive`, `count`, `items`) is left completely
 * unwrapped. h.js's own contract is "a function-valued prop is reactive,
 * called inside an effect" — signals already satisfy that by being
 * functions, so wrapping `ready` as `() => ready` would hide the signal
 * behind a lambda that always returns a (truthy) function reference
 * instead of its value. Only expressions that eagerly *compute* something
 * (calls, ternaries, member access, binary ops) need deferring.
 */
function isBareIdentifier(t, node) {
    return t.isIdentifier(node)
}

function wrapIfDynamic(t, node) {
    if (isStaticExpression(t, node) || isAlreadyFunction(t, node) || isBareIdentifier(t, node)) {
        return node
    }
    return t.arrowFunctionExpression([], node)
}

function jsxNameToString(t, nameNode) {
    if (t.isJSXIdentifier(nameNode)) {
        return nameNode.name
    }
    if (t.isJSXNamespacedName(nameNode)) {
        return `${nameNode.namespace.name}:${nameNode.name.name}`
    }
    if (t.isJSXMemberExpression(nameNode)) {
        return `${jsxNameToString(t, nameNode.object)}.${nameNode.property.name}`
    }
    return null
}

/** Resolves a JSX tag to the expression fed into jsx()'s `type` argument: a string for lowercase/dashed tags, an identifier/member-expression reference otherwise. */
function resolveTagExpression(t, openingElement) {
    const nameNode = openingElement.name

    if (t.isJSXMemberExpression(nameNode)) {
        return jsxMemberExpressionToExpression(t, nameNode)
    }

    const name = nameNode.name
    const isComponent = /^[A-Z]/.test(name) || name.includes('.')
    if (isComponent) {
        return t.identifier(name)
    }
    return t.stringLiteral(name)
}

function jsxMemberExpressionToExpression(t, node) {
    if (t.isJSXIdentifier(node)) {
        return t.identifier(node.name)
    }
    return t.memberExpression(
        jsxMemberExpressionToExpression(t, node.object),
        t.identifier(node.property.name)
    )
}

function buildPropsObject(t, openingElement, childrenExpr) {
    const properties = []

    for (const attr of openingElement.attributes) {
        if (t.isJSXSpreadAttribute(attr)) {
            properties.push(t.spreadElement(attr.argument))
            continue
        }

        const name = jsxNameToString(t, attr.name)
        const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? t.identifier(name) : t.stringLiteral(name)

        let value
        if (attr.value == null) {
            value = t.booleanLiteral(true)
        } else if (t.isStringLiteral(attr.value)) {
            value = attr.value
        } else if (t.isJSXExpressionContainer(attr.value)) {
            const expr = attr.value.expression
            value = isOpaqueAttrName(name) ? expr : wrapIfDynamic(t, expr)
        } else {
            value = attr.value
        }

        properties.push(t.objectProperty(key, value))
    }

    if (childrenExpr) {
        properties.push(t.objectProperty(t.identifier('children'), childrenExpr))
    }

    return t.objectExpression(properties)
}

/** Transforms one JSX child into the expression that belongs in the children array. Dynamic expressions are wrapped so flattenChildren()/hText() pick them up as reactive; nested elements/fragments recurse. */
function transformChild(t, path, state, node) {
    if (t.isJSXText(node)) {
        const text = node.value.replace(/^\s+|\s+$/g, ' ').trim()
        if (!text) return null
        return t.stringLiteral(text)
    }

    if (t.isJSXExpressionContainer(node)) {
        if (t.isJSXEmptyExpression(node.expression)) {
            return null
        }
        return wrapIfDynamic(t, node.expression)
    }

    if (t.isJSXElement(node)) {
        return transformJSXElement(t, path, state, node)
    }

    if (t.isJSXFragment(node)) {
        return transformJSXFragment(t, path, state, node)
    }

    if (t.isJSXSpreadChild(node)) {
        return t.spreadElement(node.expression)
    }

    return null
}

function transformChildren(t, path, state, children) {
    const items = children
        .map(child => transformChild(t, path, state, child))
        .filter(Boolean)

    if (items.length === 0) {
        return null
    }
    if (items.length === 1) {
        return items[0]
    }
    return t.arrayExpression(items)
}

function markUsed(state, name) {
    state.fuseeJsxUsed.add(name)
}

function transformJSXElement(t, path, state, node) {
    const tagExpr = resolveTagExpression(t, node.openingElement)
    const childrenExpr = transformChildren(t, path, state, node.children)
    const propsExpr = buildPropsObject(t, node.openingElement, childrenExpr)

    const isStaticChildren = node.children.length > 1
    const callee = isStaticChildren ? 'jsxs' : 'jsx'
    markUsed(state, callee)

    return t.callExpression(t.identifier(callee), [tagExpr, propsExpr])
}

function transformJSXFragment(t, path, state, node) {
    markUsed(state, 'Fragment')
    const childrenExpr = transformChildren(t, path, state, node.children)
    const isStaticChildren = node.children.length > 1
    const callee = isStaticChildren ? 'jsxs' : 'jsx'
    markUsed(state, callee)

    const props = childrenExpr
        ? t.objectExpression([t.objectProperty(t.identifier('children'), childrenExpr)])
        : t.objectExpression([])

    return t.callExpression(t.identifier(callee), [t.identifier('Fragment'), props])
}

module.exports = function fuseeJsxPlugin({ types: t }) {
    return {
        name: 'fusee-jsx',
        visitor: {
            Program: {
                enter(path, state) {
                    state.fuseeJsxUsed = new Set()
                },
                exit(path, state) {
                    if (state.fuseeJsxUsed.size === 0) 
                        return

                    const importSource = state.opts.importSource || 'fusee/jsx-runtime'
                    const specifiers = [...state.fuseeJsxUsed].sort().map(name =>
                        t.importSpecifier(t.identifier(name), t.identifier(name))
                    )

                    path.unshiftContainer('body', t.importDeclaration(specifiers, t.stringLiteral(importSource)))
                }
            },

            JSXElement(path, state) {
                path.replaceWith(transformJSXElement(t, path, state, path.node))
            },

            JSXFragment(path, state) {
                path.replaceWith(transformJSXFragment(t, path, state, path.node))
            }
        }
    }
}
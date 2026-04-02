import { effect, batch } from './signal.js'
import { evaluateExpression } from './evaluator.js'
import { compileNode } from './compiler.js'

/**
 * Main entry point for processing directives on a node.
 */
export function processDirectives(root, context, components, effects) {
    processFor(root, context, components, effects)
    processIf(root, context, components, effects)
    processShow(root, context, effects)
    processModel(root, context, effects)
    processRefs(root, context)
}

/**
 * Handles f-ref directive for template element references.
 */
export function processRefs(root, context) {
    const refEls = root.querySelectorAll('[f-ref]')
    for (const el of refEls) {
        if (!el.parentNode) continue

        const refName = el.getAttribute('f-ref')
        el.removeAttribute('f-ref')

        const refVar = context[refName]
        if (typeof refVar === 'function' && refVar.isSignal) {
            refVar(el)
        } else {
            console.warn(`[framework] f-ref requires a signal in context. Received invalid target: "${refName}"`)
        }
    }
}

/**
 * Handles f-model directive for bidirectional data binding.
 */
export function processModel(root, context, effects) {
    const modelEls = root.querySelectorAll('[f-model]')
    for (const el of modelEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-model')
        el.removeAttribute('f-model')

        const signalMethod = context[expr]
        if (typeof signalMethod === 'function' && signalMethod.isSignal) {
            effects.push(effect(() => {
                const val = signalMethod()
                if (el.type === 'checkbox') {
                    el.checked = !!val
                } else {
                    el.value = val ?? ''
                }
            }))

            const eventName = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input'
            el.addEventListener(eventName, () => {
                const newVal = el.type === 'checkbox' ? el.checked : el.value
                batch(() => signalMethod(newVal))
            })
        } else {
            console.warn(`[framework] f-model requires a signal. Received invalid expression: "${expr}"`)
        }
    }
}

/**
 * Handles f-for directive for list rendering.
 */
export function processFor(root, context, components, effects) {
    const forEls = root.querySelectorAll('[f-for]')
    for (const el of forEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-for')
        el.removeAttribute('f-for')

        const match = expr.match(/^\s*(?:(?:\(\s*([a-zA-Z_$][0-9a-zA-Z_$]*)\s*,\s*([a-zA-Z_$][0-9a-zA-Z_$]*)\s*\))|([a-zA-Z_$][0-9a-zA-Z_$]*))\s+in\s+(.+)\s*$/)
        if (!match) {
            console.warn(`[framework] Invalid f-for expression: "${expr}"`)
            continue
        }

        const itemName = match[3] || match[1]
        const indexName = match[2]
        const arrayExpr = match[4]

        const anchor = document.createComment('f-for')
        const parent = el.parentNode
        parent.insertBefore(anchor, el)

        const templateNode = el.cloneNode(true)
        parent.removeChild(el)

        let previousNodes = []
        let previousEffects = []

        effects.push(effect(() => {
            const rawItems = evaluateExpression(arrayExpr, context)
            const list = Array.isArray(rawItems) ? rawItems : []

            for (const e of previousEffects) {
                if (typeof e === 'function') e()
            }
            for (const node of previousNodes) {
                node.parentNode?.removeChild(node)
            }
            previousNodes = []
            previousEffects = []

            const fragment = document.createDocumentFragment()

            list.forEach((item, index) => {
                const clone = templateNode.cloneNode(true)
                const childContext = Object.create(context)
                childContext[itemName] = item
                if (indexName) childContext[indexName] = index

                const childEffects = []
                compileNode(clone, childContext, components, childEffects)

                fragment.appendChild(clone)
                previousNodes.push(clone)
                previousEffects.push(...childEffects)
            })

            anchor.parentNode.insertBefore(fragment, anchor)
        }))
    }
}

/**
 * Handles f-if directive for conditional rendering.
 */
export function processIf(root, context, components, effects) {
    const ifEls = root.querySelectorAll('[f-if]')
    for (const el of ifEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-if')
        el.removeAttribute('f-if')

        const anchor = document.createComment('f-if')
        const parent = el.parentNode
        parent.insertBefore(anchor, el)

        const templateNode = el.cloneNode(true)
        parent.removeChild(el)

        let currentUserNode = null
        let childEffects = []

        effects.push(effect(() => {
            const val = evaluateExpression(expr, context)
            if (val && !currentUserNode) {
                currentUserNode = templateNode.cloneNode(true)
                compileNode(currentUserNode, context, components, childEffects)
                anchor.parentNode.insertBefore(currentUserNode, anchor.nextSibling)
            } else if (!val && currentUserNode) {
                for (const e of childEffects) {
                    if (typeof e === 'function') e()
                }
                childEffects = []
                currentUserNode.parentNode.removeChild(currentUserNode)
                currentUserNode = null
            }
        }))
    }
}

/**
 * Handles f-show directive for conditional visibility.
 */
export function processShow(root, context, effects) {
    const showEls = root.querySelectorAll('[f-show]')
    for (const el of showEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-show')
        el.removeAttribute('f-show')
        const originalDisplay = el.style.display === 'none' ? '' : el.style.display

        effects.push(effect(() => {
            const val = evaluateExpression(expr, context)
            el.style.display = val ? originalDisplay : 'none'
        }))
    }
}

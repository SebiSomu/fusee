import { effect, batch } from './signal.js'
import { evaluateExpression } from './evaluator.js'
import { compileNode } from './compiler.js'

export function processDirectives(root, context, components, effects) {
    processFor(root, context, components, effects)
    processIf(root, context, components, effects)
    processShow(root, context, effects)
    processModel(root, context, effects)
    processRefs(root, context)
    processHtml(root, context, effects)
}

export function processRefs(root, context) {
    const refEls = root.querySelectorAll('[f-ref]')
    for (const el of refEls) {
        if (!el.parentNode) continue

        const refName = el.getAttribute('f-ref')
        el.removeAttribute('f-ref')

        const refVar = context[refName]
        if (typeof refVar === 'function' && refVar.isSignal && !refVar.readonly) {
            refVar(el)
        } else {
            const reason = refVar?.readonly ? 'it is read-only (computed)' : 'it is not a signal'
            console.warn(`[framework] f-ref requires a writable signal. Target "${refName}" is invalid: ${reason}`)
        }
    }
}

export function processModel(root, context, effects) {
    const modelEls = root.querySelectorAll('[f-model]')
    for (const el of modelEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-model')
        el.removeAttribute('f-model')

        const signalMethod = context[expr]
        if (typeof signalMethod === 'function' && signalMethod.isSignal && !signalMethod.readonly) {
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
            const reason = signalMethod?.readonly ? 'it is read-only (computed)' : 'it is not a signal'
            console.warn(`[framework] f-model requires a writable signal. Expression "${expr}" is invalid: ${reason}`)
        }
    }
}

export function processFor(root, context, components, effects) {
    const forEls = root.querySelectorAll('[f-for]')
    for (const el of forEls) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-for')
        el.removeAttribute('f-for')

        const match = expr.match(/^\s*(?:(?:\(\s*([a-zA-Z_$][0-9a-zA-Z_$]*)(?:\s*,\s*([a-zA-Z_$][0-9a-zA-Z_$]*))?(?:\s*,\s*([a-zA-Z_$][0-9a-zA-Z_$]*))?\s*\))|([a-zA-Z_$][0-9a-zA-Z_$]*))\s+in\s+(.+)\s*$/)
        if (!match) {
            console.warn(`[framework] Invalid f-for expression: "${expr}"`)
            continue
        }

        const itemName = match[4] || match[1]
        const keyName = match[2]
        const indexName = match[3]
        const arrayExpr = match[5]

        const anchor = document.createComment('f-for')
        const parent = el.parentNode
        parent.insertBefore(anchor, el)

        const templateNode = el.cloneNode(true)
        parent.removeChild(el)

        let previousNodes = []
        let previousEffects = []

        effects.push(effect(() => {
            const rawItems = evaluateExpression(arrayExpr, context)
            let items = []

            if (Array.isArray(rawItems)) {
                items = rawItems.map((item, index) => ({ value: item, key: index, index }))
            } else if (typeof rawItems === 'number' && !isNaN(rawItems)) {
                items = Array.from({ length: Math.max(0, Math.floor(rawItems)) }, (_, i) => ({ value: i + 1, key: i, index: i }))
            } else if (rawItems && typeof rawItems === 'object') {
                items = Object.entries(rawItems).map(([key, value], index) => ({ value, key, index }))
            }

            for (const e of previousEffects) if (typeof e === 'function') e()
            for (const node of previousNodes) node.parentNode?.removeChild(node)

            previousNodes = []
            previousEffects = []

            const fragment = document.createDocumentFragment()
            items.forEach((item) => {
                const clone = templateNode.cloneNode(true)
                const childContext = Object.create(context)

                childContext[itemName] = item.value
                if (keyName) childContext[keyName] = item.key
                if (indexName) childContext[indexName] = item.index

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

export function processIf(root, context, components, effects) {
    const ifEls = Array.from(root.querySelectorAll('[f-if]'))
    const processedEls = new Set()

    for (const ifEl of ifEls) {
        if (processedEls.has(ifEl)) continue

        const parent = ifEl.parentNode
        if (!parent) continue

        const group = []
        let curr = ifEl

        while (curr) {
            if (curr.nodeType === 1) {
                const type = curr.hasAttribute('f-if') ? 'if' :
                    curr.hasAttribute('f-elif') ? 'elif' :
                        curr.hasAttribute('f-else-if') ? 'elif' :
                            curr.hasAttribute('f-else') ? 'else' : null

                if (type) {
                    const expr = type === 'else' ? 'true' : curr.getAttribute(`f-${type === 'elif' && curr.hasAttribute('f-else-if') ? 'else-if' : type}`)
                    group.push({ node: curr, expr, type, isElement: true })
                    processedEls.add(curr)

                    curr.removeAttribute('f-if')
                    curr.removeAttribute('f-elif')
                    curr.removeAttribute('f-else-if')
                    curr.removeAttribute('f-else')

                    if (type === 'else') break
                } else {
                    break
                }
            } else if (curr.nodeType === 3 && curr.textContent.trim() === '' || curr.nodeType === 8) {
                group.push({ node: curr, isElement: false })
            } else {
                break
            }
            curr = curr.nextSibling
        }

        const templates = group
            .filter(item => item.isElement)
            .map(item => ({
                template: item.node.cloneNode(true),
                expr: item.expr,
                type: item.type
            }))

        const anchor = document.createComment('f-condition-anchor')
        parent.insertBefore(anchor, ifEl)

        for (const item of group) item.node.remove()

        let activeIndex = -1
        let activeNode = null
        let activeCleanup = []

        effects.push(effect(() => {
            let nextIndex = -1
            for (let i = 0; i < templates.length; i++) {
                const isMatch = templates[i].type === 'else' ? true : evaluateExpression(templates[i].expr, context)
                if (isMatch) {
                    nextIndex = i
                    break
                }
            }

            if (nextIndex !== activeIndex) {
                for (const cleanup of activeCleanup) if (typeof cleanup === 'function') cleanup()
                activeCleanup = []
                if (activeNode) {
                    activeNode.remove()
                    activeNode = null
                }

                if (nextIndex !== -1) {
                    activeNode = templates[nextIndex].template.cloneNode(true)
                    compileNode(activeNode, context, components, activeCleanup)
                    anchor.parentNode.insertBefore(activeNode, anchor.nextSibling)
                }
                activeIndex = nextIndex
            }
        }))
    }
}

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

export function processHtml(root, context, effects) {
    const els = root.querySelectorAll('[f-html]')
    for (const el of els) {
        if (!el.parentNode) continue

        const expr = el.getAttribute('f-html')
        el.removeAttribute('f-html')

        const isDev = typeof import.meta.env !== 'undefined' ? !!import.meta.env.DEV : true
        if (isDev) {
            console.warn(`[framework] f-html can expose the site to XSS. Use only with trusted content.`)
        }

        effects.push(effect(() => {
            const val = evaluateExpression(expr, context)
            el.innerHTML = String(val ?? '')
        }))
    }
}

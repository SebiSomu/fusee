import { signal, effect, batch } from './signal.js'
import { evaluateExpression } from './evaluator.js'
import { compileNode } from './compiler.js'

export function processDirectives(root, context, components, effects) {
    if (processFor(root, context, components, effects)) return true
    if (processIf(root, context, components, effects)) return true

    processShow(root, context, effects)
    processModel(root, context, effects)
    processRefs(root, context)
    processHtml(root, context, effects)
    processText(root, context, effects)
    processEvents(root, context, effects)
    processCloak(root)

    return false
}

export function processRefs(el, context) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-ref')) return

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

export function processModel(el, context, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-model')) return

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
        const handler = () => {
            const newVal = el.type === 'checkbox' ? el.checked : el.value
            batch(() => signalMethod(newVal))
        }
        el.addEventListener(eventName, handler)
        effects.push(() => el.removeEventListener(eventName, handler))
    } else {
        const reason = signalMethod?.readonly ? 'it is read-only (computed)' : 'it is not a signal'
        console.warn(`[framework] f-model requires a writable signal. Expression "${expr}" is invalid: ${reason}`)
    }
}

export function processFor(el, context, components, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-for')) return false

    const expr = el.getAttribute('f-for')
    el.removeAttribute('f-for')

    const match = expr.match(/^\s*(?:(?:\(\s*([a-zA-Z_$][0-9a-zA-Z_$]*)(?:\s*,\s*([a-zA-Z_$][0-9a-zA-Z_$]*))?(?:\s*,\s*([a-zA-Z_$][0-9a-zA-Z_$]*))?\s*\))|([a-zA-Z_$][0-9a-zA-Z_$]*))\s+in\s+(.+)\s*$/)
    if (!match) {
        console.warn(`[framework] Invalid f-for expression: "${expr}"`)
        return false
    }

    const itemName = match[4] || match[1]
    const keyName = match[2]
    const indexName = match[3]
    const arrayExpr = match[5]

    const keyExpr = el.getAttribute('data-bind-key') || el.getAttribute(':key')
    if (keyExpr) {
        el.removeAttribute('data-bind-key')
        el.removeAttribute(':key')
    }

    const anchor = document.createComment('f-for')
    const parent = el.parentNode
    parent.insertBefore(anchor, el)

    const templateNode = el.cloneNode(true)
    parent.removeChild(el)

    // Cache of currently rendered items: Map<key, { node, effects, context }>
    let cache = new Map()
    let previousOrder = []

    effects.push(effect(() => {
        const rawItems = evaluateExpression(arrayExpr, context)
        let items = []

        if (Array.isArray(rawItems)) {
            items = rawItems.map((item, index) => ({ value: item, rawIndex: index }))
        } else if (typeof rawItems === 'number' && !isNaN(rawItems)) {
            items = Array.from({ length: Math.max(0, Math.floor(rawItems)) }, (_, i) => ({ value: i + 1, rawIndex: i }))
        } else if (rawItems && typeof rawItems === 'object') {
            items = Object.entries(rawItems).map(([key, value], index) => ({ value, key, rawIndex: index }))
        }

        const nextCache = new Map()
        const nextOrder = []

        const newItemsWithKeys = items.map((item, index) => {
            const itemContext = Object.create(context)
            itemContext[itemName] = item.value
            if (keyName) itemContext[keyName] = item.hasOwnProperty('key') ? item.key : item.rawIndex
            if (indexName) itemContext[indexName] = index

            const key = keyExpr ? evaluateExpression(keyExpr, itemContext) : item.rawIndex
            return { item, key }
        })

        const parentNode = anchor.parentNode
        let currentCursor = anchor.nextSibling

        newItemsWithKeys.forEach(({ item, key }, index) => {
            let entry = cache.get(key)

            if (entry) {
                // Update existing reactive signals for reused items
                batch(() => {
                    if (typeof entry.context[itemName] === 'function' && entry.context[itemName].isSignal) {
                        entry.context[itemName](item.value)
                    }
                    if (keyName && typeof entry.context[keyName] === 'function' && entry.context[keyName].isSignal) {
                        entry.context[keyName](item.hasOwnProperty('key') ? item.key : item.rawIndex)
                    }
                    if (indexName && typeof entry.context[indexName] === 'function' && entry.context[indexName].isSignal) {
                        entry.context[indexName](index)
                    }
                })

                if (entry.node !== currentCursor) {
                    parentNode.insertBefore(entry.node, currentCursor)
                } else {
                    currentCursor = currentCursor.nextSibling
                }
                cache.delete(key)
            } else {
                // Create new item context with signals for local state
                const itemContext = Object.create(context)
                itemContext[itemName] = signal(item.value)
                if (keyName) itemContext[keyName] = signal(item.hasOwnProperty('key') ? item.key : item.rawIndex)
                if (indexName) itemContext[indexName] = signal(index)

                const clone = templateNode.cloneNode(true)
                const childEffects = []
                compileNode(clone, itemContext, components, childEffects)

                parentNode.insertBefore(clone, currentCursor)
                entry = { node: clone, effects: childEffects, context: itemContext }
            }

            nextCache.set(key, entry)
            nextOrder.push(entry.node)
        })

        // Cleanup removed nodes
        for (const [_, entry] of cache.entries()) {
            for (const e of entry.effects) if (typeof e === 'function') e()
            entry.node.parentNode?.removeChild(entry.node)
        }

        cache = nextCache
        previousOrder = nextOrder
    }))

    effects.push(() => {
        for (const entry of cache.values()) {
            for (const cleanup of entry.effects) if (typeof cleanup === 'function') cleanup()
        }
        cache.clear()
    })

    return true
}

export function processIf(el, context, components, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-if')) return false

    const parent = el.parentNode
    if (!parent) return false

    const group = []
    let curr = el

    while (curr) {
        if (curr.nodeType === 1) {
            const type = curr.hasAttribute('f-if') ? 'if' :
                curr.hasAttribute('f-elif') ? 'elif' :
                    curr.hasAttribute('f-else-if') ? 'elif' :
                        curr.hasAttribute('f-else') ? 'else' : null

            if (type) {
                const expr = type === 'else' ? 'true' : curr.getAttribute(`f-${type === 'elif' && curr.hasAttribute('f-else-if') ? 'else-if' : type}`)
                group.push({ node: curr, expr, type, isElement: true })

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
    parent.insertBefore(anchor, el)

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

    effects.push(() => {
        for (const cleanup of activeCleanup) if (typeof cleanup === 'function') cleanup()
        activeCleanup = []
    })

    return true
}

export function processShow(el, context, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-show')) return

    const expr = el.getAttribute('f-show')
    el.removeAttribute('f-show')
    const originalDisplay = el.style.display === 'none' ? '' : el.style.display

    effects.push(effect(() => {
        const val = evaluateExpression(expr, context)
        el.style.display = val ? originalDisplay : 'none'
    }))
}

export function processHtml(el, context, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-html')) return

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

export function processEvents(el, context, effects) {
    if (el.nodeType !== 1 || !el.attributes) return

    for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('@')) {
            const fullEventName = attr.name.slice(1)
            const parts = fullEventName.split('.')
            const eventName = parts[0]
            const modifiers = parts.slice(1)
            const expr = attr.value

            el.removeAttribute(attr.name)

            let timeoutId
            let debounceMs = 0
            const debounceIdx = modifiers.indexOf('debounce')
            if (debounceIdx > -1) {
                debounceMs = 250 // default value
                const nextModifier = modifiers[debounceIdx + 1]
                if (nextModifier) {
                    if (nextModifier.endsWith('ms')) debounceMs = parseInt(nextModifier) || 250
                    else if (nextModifier.endsWith('s')) debounceMs = (parseFloat(nextModifier) || 0.25) * 1000
                }
            }

            const executeLogic = (e) => {
                batch(() => {
                    const potentialFn = context[expr]
                    if (typeof potentialFn === 'function' && !potentialFn.isSignal) {
                        potentialFn(e)
                    } else {
                        evaluateExpression(expr, context, { $event: e }, false)
                    }
                })
            }

            const handler = (e) => {
                if (modifiers.includes('prevent')) e.preventDefault()
                if (modifiers.includes('stop')) e.stopPropagation()
                if (modifiers.includes('self') && e.target !== el) return

                // Specific handling for common modifiers like .enter, .escape etc on keyboard events
                if (e instanceof KeyboardEvent) {
                    const key = e.key.toLowerCase()
                    const keyModifiers = modifiers.filter(m => ['enter', 'escape', 'tab', 'space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(m))
                    if (keyModifiers.length > 0) {
                        const match = keyModifiers.some(m => {
                            if (m === 'escape') return key === 'escape' || key === 'esc'
                            if (m === 'space') return key === ' ' || key === 'spacebar'
                            return key === m
                        })
                        if (!match) return
                    }
                }

                // Apply debounce only for the framework's "user space" logic
                if (debounceMs > 0) {
                    clearTimeout(timeoutId)
                    timeoutId = setTimeout(() => executeLogic(e), debounceMs)
                } else {
                    executeLogic(e)
                }
            }

            const targetNode = modifiers.includes('window') ? window : (modifiers.includes('document') ? document : el)
            const options = {
                once: modifiers.includes('once'),
                capture: modifiers.includes('capture') || modifiers.includes('away')
            }

            targetNode.addEventListener(eventName, handler, options)
            if (effects) {
                effects.push(() => {
                    targetNode.removeEventListener(eventName, handler, options)
                    if (timeoutId) clearTimeout(timeoutId) // Clear pending operations on destroy!
                })
            }
        }
    }
}

export function processText(el, context, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-text')) return
    const expr = el.getAttribute('f-text')
    el.removeAttribute('f-text')
    effects.push(effect(() => {
        const val = evaluateExpression(expr, context)
        el.textContent = String(val ?? '')
    }))
}

export function processCloak(el) {
    if (el.nodeType !== 1) return
    if (el.hasAttribute('f-cloak')) el.removeAttribute('f-cloak')

    const els = el.querySelectorAll('[f-cloak]')
    for (const e of els) e.removeAttribute('f-cloak')
}

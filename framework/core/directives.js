import { signal, effect, batch } from './signal.js'
import { evaluateExpression } from './evaluator.js'
import { compileNode } from './compiler.js'

const customDirectives = new Map()

export function directive(name, definition) {
    if (typeof name !== 'string' || !name.trim()) {
        console.error('[framework] directive() requires a non-empty name')
        return
    }
    if (!definition || typeof definition !== 'object') {
        console.error(`[framework] directive("${name}") requires a definition object`)
        return
    }
    customDirectives.set(name, definition)
}

export function processCustomDirectives(el, context, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute || !el.attributes) return

    for (const attr of [...el.attributes]) {
        const match = attr.name.match(/^f-([a-zA-Z0-9-]+)(?::([a-zA-Z0-9-]+))?(?:\.(.+))?$/)

        if (!match) continue

        const directiveName = match[1]
        const arg = match[2] || null
        const modifiersStr = match[3]
        const modifiers = modifiersStr ? modifiersStr.split('.') : []

        const definition = customDirectives.get(directiveName)
        if (!definition) {
            continue
        }

        el.removeAttribute(attr.name)

        const value = evaluateExpression(attr.value, context)
        const expression = attr.value

        const binding = {
            value,
            expression,
            arg,
            modifiers
        }

        if (typeof definition.mounted === 'function') {
            definition.mounted(el, binding)
        }

        if (typeof definition.updated === 'function') {
            effects.push(effect(() => {
                const newValue = evaluateExpression(expression, context)

                if (!Object.is(binding.value, newValue)) {
                    binding.value = newValue
                    definition.updated(el, binding)
                }
            }))
        }

        if (typeof definition.unmounted === 'function') {
            effects.push(() => {
                definition.unmounted(el, binding)
            })
        }
    }
}

export function processDirectives(root, context, components, effects) {
    if (processFor(root, context, components, effects)) return true
    if (processIf(root, context, components, effects)) return true
    if (processIs(root, context, components, effects)) return true

    processShow(root, context, effects)
    processModel(root, context, effects)
    processRefs(root, context)
    processHtml(root, context, effects)
    processText(root, context, effects)
    processEvents(root, context, effects)
    processCustomDirectives(root, context, effects)
    processClassList(root, context, effects)
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

export function processIs(el, context, components, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-is')) return false

    const expr = el.getAttribute('f-is')
    const keepAlive = processKeepAlive(el)

    el.removeAttribute('f-is')

    const anchor = document.createComment('f-keepAlive-anchor')
    el.parentNode.insertBefore(anchor, el)
    const templateNode = el.cloneNode(true)
    el.remove()

    const cache = new Map()
    let activeKey = null
    let activeCleanup = []

    effects.push(effect(() => {
        const rawValue = evaluateExpression(expr, context)

        if (rawValue === activeKey) return

        if (activeKey !== null) {
            const currentEntry = cache.get(activeKey)
            if (currentEntry) {
                if (keepAlive) {
                    currentEntry.node.remove()
                } else {
                    for (const cleanup of activeCleanup) if (typeof cleanup === 'function') cleanup()
                    currentEntry.node.remove()
                    cache.delete(activeKey)
                    activeCleanup = []
                }
            }
        }

        if (!rawValue) {
            activeKey = null
            return
        }

        let entry = cache.get(rawValue)

        if (entry && keepAlive) {
            anchor.parentNode.insertBefore(entry.node, anchor.nextSibling)
            activeCleanup = entry.cleanup
        } else {
            let ComponentFn = typeof rawValue === 'string' ? components[rawValue] : rawValue

            if (typeof ComponentFn !== 'function') {
                console.warn(`[framework] f-is: Component "${rawValue}" not found or invalid.`)
                return
            }

            const compEl = templateNode.cloneNode(true)
            compEl._isDynamicComponent = true

            const tempName = '__dynamic_component__'
            compEl.setAttribute('data-component', tempName)

            anchor.parentNode.insertBefore(compEl, anchor.nextSibling)

            const childCleanup = []
            const dynamicComponents = { ...components, [tempName]: ComponentFn }

            compileNode(compEl, context, dynamicComponents, childCleanup)

            entry = { node: compEl, cleanup: childCleanup }
            cache.set(rawValue, entry)
            activeCleanup = childCleanup
        }

        activeKey = rawValue
    }))

    effects.push(() => {
        for (const entry of cache.values()) {
            for (const c of entry.cleanup) if (typeof c === 'function') c()
            entry.node.remove()
        }
        cache.clear()
    })

    return true
}

function processKeepAlive(el) {
    if (el.nodeType !== 1) return false
    const hasKeepAlive = el.hasAttribute('f-keepAlive')
    if (hasKeepAlive) el.removeAttribute('f-keepAlive')
    return hasKeepAlive
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
            let lastRun = 0
            let throttleTimeoutId

            let debounceMs = 0
            let throttleMs = 0

            const parseDuration = (idx) => {
                const next = modifiers[idx + 1]
                if (next && /^\d/.test(next)) {
                    if (next.endsWith('ms')) return parseInt(next) || 250
                    if (next.endsWith('s')) return (parseFloat(next) || 0.25) * 1000
                }
                return 250 
            }

            const debounceIdx = modifiers.indexOf('debounce')
            if (debounceIdx > -1) debounceMs = parseDuration(debounceIdx)

            const throttleIdx = modifiers.indexOf('throttle')
            if (throttleIdx > -1) throttleMs = parseDuration(throttleIdx)

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

                if (throttleMs > 0) {
                    const now = Date.now()
                    const remaining = throttleMs - (now - lastRun)

                    if (remaining <= 0) {
                        clearTimeout(throttleTimeoutId)
                        lastRun = now
                        executeLogic(e)
                    } else {
                        clearTimeout(throttleTimeoutId)
                        throttleTimeoutId = setTimeout(() => {
                            lastRun = Date.now()
                            executeLogic(e)
                        }, remaining)
                    }
                    return
                }

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
                    if (timeoutId) clearTimeout(timeoutId)
                    if (throttleTimeoutId) clearTimeout(throttleTimeoutId)
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

export function processClassList(el, context, effects) {
    if (el.nodeType !== 1 || !el.hasAttribute('f-classList')) return

    const expr = el.getAttribute('f-classList')
    el.removeAttribute('f-classList')

    const appliedClasses = new Set()

    const e = effect(() => {
        const result = evaluateExpression(expr, context)

        if (!result || typeof result !== 'object') {
            console.warn(`[framework] f-classList must evaluate to an object, got: ${typeof result}`)
            return
        }

        for (const [className, shouldApply] of Object.entries(result)) {
            const isApplied = appliedClasses.has(className)

            if (shouldApply && !isApplied) {
                el.classList.add(className)
                appliedClasses.add(className)
            } else if (!shouldApply && isApplied) {
                el.classList.remove(className)
                appliedClasses.delete(className)
            }
        }

        const currentClasses = new Set(Object.keys(result))
        for (const className of [...appliedClasses]) {
            if (!currentClasses.has(className)) {
                el.classList.remove(className)
                appliedClasses.delete(className)
            }
        }
    })

    effects.push(e)
}

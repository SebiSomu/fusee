import { effect, batch, signal, microEffect } from '../core/signal.js'
import { createEventHandler, registerDelegatedEvent, isDelegatedEvent } from '../core/event-delegation.js'

export { effect as _effect, batch as _batch }

function isGetter(v) {
    return typeof v === 'function' && !v.isSignal
}

const SENSITIVE_ATTRS  = new Set(['href', 'src', 'srcset', 'formaction', 'xlink:href', 'data'])
const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i

function sanitize(name, value) {
    if (SENSITIVE_ATTRS.has(name.toLowerCase())) {
        const trimmed = String(value).trim()
        if (DANGEROUS_SCHEME.test(trimmed)) {
            console.warn(`[fusée] Blocked potential XSS on "${name}": "${value}"`)
            return 'about:blank'
        }
    }
    return value
}

const _shellCache = new Map()

export function _shell(html) {
    let tpl = _shellCache.get(html)
    if (!tpl) {
        tpl = document.createElement('template')
        tpl.innerHTML = html
        _shellCache.set(html, tpl)
    }
    return () => tpl.content.firstChild.cloneNode(true)
}

export function _bindEvent(el, eventName, modifiers, handler, effects) {
    const handlerState = { timeoutId: null, throttleTimeoutId: null, lastRun: 0 }
    const wrapped = createEventHandler(handler, modifiers, null, null, handlerState)

    if (isDelegatedEvent(eventName)) {
        effects.push(registerDelegatedEvent(el, eventName, wrapped, { modifiers, handlerState }))
    } else {
        el.addEventListener(eventName, wrapped)
        effects.push(() => el.removeEventListener(eventName, wrapped))
    }
}

export function h(tag, props = {}, children = [], isStatic = false) {
    const el = document.createElement(tag)
    const effects = []

    if (!isStatic) {
        _applyProps(el, props, effects)
    } else {
        _applyStaticProps(el, props)
    }

    const childNodes = _mountChildren(el, children, effects)

    return {
        node: el,
        effects,
        props,
        children: childNodes,
        _tag: tag,
    }
}

export function hText(value) {
    const node = document.createTextNode('')
    const effects = []

    if (typeof value === 'function') {
        const cleanup = microEffect(() => {
            node.textContent = String(value() ?? '')
        })
        effects.push(cleanup)
    } else {
        node.textContent = String(value ?? '')
    }

    return { node, effects }
}

export function hIf(branches) {
    const anchor  = document.createComment('f-if')
    const effects = []

    let currentNodes  = []
    let currentBranch = -1

    const cleanup = effect(() => {
        let matchIdx = -1
        for (let i = 0; i < branches.length; i++) {
            const [cond] = branches[i]
            if (cond === null || cond()) { matchIdx = i; break }
        }

        if (matchIdx === currentBranch) return

        _unmountNodes(currentNodes)
        currentNodes  = []
        currentBranch = matchIdx

        if (matchIdx === -1) return

        const [, getChildren] = branches[matchIdx]
        const children = getChildren()
        const parent   = anchor.parentNode

        if (parent) {
            for (const fnode of children) {
                parent.insertBefore(fnode.node, anchor)
                currentNodes.push(fnode)
            }
        }
    })

    effects.push(cleanup)

    return {
        node: anchor,
        effects,
        _ifBranchNodes: () => currentNodes,
        _isIf: true,
    }
}

export function hFor(sourceGetter, renderItem, keyFn) {
    const anchor  = document.createComment('f-for')
    const effects = []

    let keyedMap = new Map()
    let oldKeys  = []
    let _keyEvalCurrent = null
    const keyEvaluatorGetter = () => _keyEvalCurrent
    keyEvaluatorGetter.isSignal = true

    const cleanup = effect(() => {
        const list = sourceGetter() ?? []
        const parent = anchor.parentNode

        if (!parent) {
            return
        }

        const newKeys = new Array(list.length)
        for (let i = 0; i < list.length; i++) {
            _keyEvalCurrent = list[i]
            newKeys[i] = keyFn(keyEvaluatorGetter, i)
        }

        if (oldKeys.length === newKeys.length) {
            let identical = true
            for (let i = 0; i < newKeys.length; i++) {
                if (oldKeys[i] !== newKeys[i]) { identical = false; break }
            }
            if (identical) {
                for (let i = 0; i < list.length; i++) {
                    const entry = keyedMap.get(newKeys[i])
                    if (entry.itemSignal() !== list[i]) {
                        entry.itemSignal(list[i])
                    }
                }
                return
            }
        }

        if (oldKeys.length === newKeys.length) {
            let diffA = -1, diffB = -1, diffCount = 0
            for (let i = 0; i < newKeys.length; i++) {
                if (oldKeys[i] !== newKeys[i]) {
                    if (diffCount === 0) {
                        diffA = i
                    } else if (diffCount === 1) {
                        diffB = i
                    }
                    diffCount++
                    if (diffCount > 2) 
                        break
                }
            }
            if (diffCount === 2 && oldKeys[diffA] === newKeys[diffB] && oldKeys[diffB] === newKeys[diffA]) {
                const entryA = keyedMap.get(oldKeys[diffA])
                const entryB = keyedMap.get(oldKeys[diffB])
                const nodeA = entryA.fnode.node
                const nodeB = entryB.fnode.node
                const refA = nodeA.nextSibling
                const parentEl = nodeA.parentNode
                parentEl.insertBefore(nodeA, nodeB.nextSibling)
                parentEl.insertBefore(nodeB, refA)
                if (entryA.itemSignal() !== list[diffA]) {
                    entryA.itemSignal(list[diffA])
                }
                if (entryB.itemSignal() !== list[diffB]) {
                    entryB.itemSignal(list[diffB])
                }
                oldKeys = newKeys
                return
            }
        }

        const newMap = new Map()

        for (let i = 0; i < list.length; i++) {
            const item = list[i]
            const key  = newKeys[i]

            const exists = keyedMap.get(key)
            if (exists) {
                if (exists.itemSignal() !== item) {
                    exists.itemSignal(item)
                }
                newMap.set(key, exists)
            } else {
                const itemSignal = signal(item)
                const fnode = renderItem(itemSignal, i)
                newMap.set(key, { fnode, key, itemSignal })
            }
        }

        for (const [key, entry] of keyedMap) {
            if (!newMap.has(key)) {
                _unmountNodes([entry.fnode])
            }
        }

        const newEntries = newKeys.map(k => newMap.get(k))
        const oldIndexOf = new Map()
        oldKeys.forEach((k, i) => oldIndexOf.set(k, i))

        const posMap = newEntries.map(entry => {
            const idx = oldIndexOf.get(entry.key)
            return idx === undefined ? -1 : idx
        })

        const lisIndices = _getLIS(posMap)
        let lisPtr = lisIndices.length - 1

        for (let i = newEntries.length - 1; i >= 0; i--) {
            const entry = newEntries[i]
            const ref = i === newEntries.length - 1 ? anchor : newEntries[i + 1].fnode.node
            const inLis = lisPtr >= 0 && i === lisIndices[lisPtr]

            if (inLis) {
                lisPtr--
                if (!entry.fnode.node.parentNode) {
                    parent.insertBefore(entry.fnode.node, ref)
                }
            } else if (entry.fnode.node.nextSibling !== ref || !entry.fnode.node.parentNode) {
                parent.insertBefore(entry.fnode.node, ref)
            }
        }

        keyedMap = newMap
        oldKeys  = newKeys
    })

    effects.push(cleanup)

    return {
        node: anchor,
        effects,
        _isFor: true,
        _getNodes: () => [...keyedMap.values()].map(e => e.fnode),
    }
}

function _getLIS(arr) {
    const p = arr.slice()
    const result = []

    for (let i = 0; i < arr.length; i++) {
        if (arr[i] === -1) continue

        if (result.length === 0 || arr[result[result.length - 1]] < arr[i]) {
            p[i] = result.length ? result[result.length - 1] : -1
            result.push(i)
            continue
        }

        let lo = 0, hi = result.length - 1
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (arr[result[mid]] < arr[i]) lo = mid + 1
            else hi = mid
        }
        if (arr[i] < arr[result[lo]]) {
            p[i] = lo > 0 ? result[lo - 1] : -1
            result[lo] = i
        }
    }

    let u = result.length
    let v = u > 0 ? result[u - 1] : -1
    const seq = new Array(u)
    while (u-- > 0) {
        seq[u] = v
        v = p[v]
    }
    return seq
}

export function hSlot(slots, name, fallback = []) {
    const anchor = document.createComment(`slot:${name}`)
    const effects = []
    const slotFn = slots?.[name]
    const nodes = typeof slotFn === 'function' ? slotFn() : fallback
    return {
        node: anchor,
        effects,
        _slotNodes: nodes,
        _isSlot: true,
    }
}

export function createComponent(name, ComponentFn, rawProps = {}, rawSlots = {}) {
    if (!ComponentFn) {
        console.warn(`[fusée] Component "${name}" is not registered`)
        const placeholder = document.createComment(`missing:${name}`)
        return { node: placeholder, effects: [] }
    }

    const resolvedProps = _resolveComponentProps(rawProps)
    const listeners = {}
    const slots = {}

    for (const [key, value] of Object.entries(rawProps)) {
        if (key.startsWith('on:')) {
            listeners[key.slice(3)] = value
        }
    }

    for (const [slotName, slotFn] of Object.entries(rawSlots)) {
        slots[slotName] = slotFn
    }

    const container = document.createElement('div')
    container.setAttribute('data-fusee-component', name)

    const api = ComponentFn(resolvedProps, { listeners, slots })
    api.render(container)
    const root = container.firstElementChild ?? container

    const effects = []
    effects.push(() => api.unmount())

    return { node: root, effects, _component: api }
}

function _applyProps(el, props, effects) {
    for (const key in props) {
        const value = props[key]
        if (key.startsWith('@')) {
            const eventName = key.slice(1)
            const { handler, modifiers = [] } = value
            const handlerState = { timeoutId: null, throttleTimeoutId: null, lastRun: 0 }
            const wrappedHandler = createEventHandler(handler, modifiers, null, null, handlerState)

            let cleanup
            if (isDelegatedEvent(eventName)) {
                cleanup = registerDelegatedEvent(el, eventName, wrappedHandler, { modifiers, handlerState })
            } else {
                el.addEventListener(eventName, wrappedHandler)
                cleanup = () => el.removeEventListener(eventName, wrappedHandler)
            }
            effects.push(cleanup)
            continue
        }

        if (key === 'f-show') {
            const cleanup = effect(() => {
                el.style.display = value() ? '' : 'none'
            })
            effects.push(cleanup)
            continue
        }

        if (key === 'f-html') {
            const cleanup = effect(() => {
                el.innerHTML = String(value() ?? '')
            })
            effects.push(cleanup)
            continue
        }

        if (key === 'f-model') {
            const sig = value()
            const cleanup = effect(() => {
                const v = typeof sig === 'function' ? sig() : sig
                if (el.value !== String(v ?? '')) el.value = String(v ?? '')
            })
            effects.push(cleanup)
            continue
        }

        if (key === 'f-ref') {
            el.dispatchEvent(new CustomEvent('fusee:ref', {
                detail: { name: value },
                bubbles: true,
            }))
            continue
        }

        if (key === 'f-once') continue

        if (typeof value !== 'function') {
            _applyAttr(el, key, value)
            continue
        }

        const attrName = key
        const getter = value
        const cleanup = effect(() => {
            _applyAttr(el, attrName, getter())
        })
        effects.push(cleanup)
    }
}

function _applyStaticProps(el, props) {
    for (const key in props) {
        const value = props[key]
        if (key.startsWith('@') || key.startsWith('f-')) 
            continue
        if (typeof value !== 'function') 
            _applyAttr(el, key, value)
    }
}

export function _applyAttr(el, name, value) {
    if (name === 'class') {
        const cls = _resolveClass(value)
        if (cls) el.className = cls
        else el.removeAttribute('class')
        return
    }

    if (name === 'style') {
        if (value !== null && typeof value === 'object') {
            for (const k in value) el.style[k] = value[k]
        } else {
            el.style.cssText = String(value ?? '')
        }
        return
    }

    if (name in el && typeof el[name] !== 'undefined' && name !== 'type') {
        try {
            el[name] = value
            return
        } catch (_) {
            return
        }
    }

    if (typeof value === 'boolean') {
        value ? el.setAttribute(name, '') : el.removeAttribute(name)
        return
    }

    if (value == null) {
        el.removeAttribute(name)
        return
    }

    el.setAttribute(name, sanitize(name, String(value)))
}

function _resolveClass(value) {
    if (typeof value === 'string') 
        return value
    if (Array.isArray(value)) 
        return value.filter(Boolean).join(' ')
    if (value && typeof value === 'object') 
        return Object.entries(value).filter(([, v]) => !!v).map(([k]) => k).join(' ')
    return String(value ?? '')
}

function _mountChildren(parent, children, parentEffects) {
    const mounted = []

    for (const fnode of children) {
        if (!fnode || !fnode.node) continue

        parent.appendChild(fnode.node)

        if (fnode._isSlot && fnode._slotNodes) {
            for (const sn of fnode._slotNodes) {
                if (sn?.node) parent.insertBefore(sn.node, null)
            }
        }

        if (fnode.effects) parentEffects.push(...fnode.effects)
        mounted.push(fnode)
    }

    return mounted
}

function _unmountNodes(fnodes) {
    for (const fnode of fnodes) {
        if (!fnode) continue

        if (fnode.effects) {
            for (let i = fnode.effects.length - 1; i >= 0; i--) {
                const cleanup = fnode.effects[i]
                if (typeof cleanup === 'function') cleanup()
            }
        }

        if (fnode.node?.parentNode) {
            fnode.node.parentNode.removeChild(fnode.node)
        }

        if (fnode._ifBranchNodes) {
            _unmountNodes(fnode._ifBranchNodes())
        }

        if (fnode._getNodes) {
            _unmountNodes(fnode._getNodes())
        }
    }
}

function _resolveComponentProps(rawProps) {
    const resolved = {}

    for (const [key, value] of Object.entries(rawProps)) {
        if (key.startsWith('on:')) continue

        if (isGetter(value)) {
            Object.defineProperty(resolved, key, {
                get: value,
                enumerable: true,
                configurable: true,
            })
        } else {
            resolved[key] = value
        }
    }

    return resolved
}

export function mount(renderFn, ctx, components, container) {
    const fnodes  = renderFn(ctx, components)
    const effects = []

    for (const fnode of fnodes) {
        if (!fnode?.node) continue
        container.appendChild(fnode.node)
        if (fnode.effects) effects.push(...fnode.effects)
    }

    return {
        unmount() {
            _unmountNodes(fnodes)
            container.innerHTML = ''
        }
    }
}
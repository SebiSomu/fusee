import { batch } from './signal.js'
import { evaluateExpression } from './evaluator.js'

export const DELEGATED_EVENTS = new Set([
    'beforeinput',
    'click',
    'dblclick',
    'contextmenu',
    'focusin',
    'focusout',
    'input',
    'keydown',
    'keyup',
    'mousedown',
    'mousemove',
    'mouseout',
    'mouseover',
    'mouseup',
    'pointerdown',
    'pointermove',
    'pointerout',
    'pointerover',
    'pointerup',
    'touchend',
    'touchmove',
    'touchstart'
])

const delegatedListeners = new Map()
const documentListeners = new Map()

export function isDelegatedEvent(eventName) {
    return DELEGATED_EVENTS.has(eventName.toLowerCase())
}

function ensureDocumentListener(eventType) {
    if (documentListeners.has(eventType)) {
        return
    }

    const handler = (e) => {
        const listeners = delegatedListeners.get(eventType)
        if (!listeners || listeners.size === 0) return

        let target = e.target
        while (target && target !== document.body && target !== document.documentElement) {
            for (const entry of listeners) {
                if (entry.element === target) {
                    entry.handler(e)
                }
            }
            target = target.parentNode
        }
    }

    document.addEventListener(eventType, handler, true)
    documentListeners.set(eventType, handler)
}

export function registerDelegatedEvent(element, eventType, handler, options = {}) {
    const { modifiers = [], context, expr, handlerState } = options
    const normalizedEvent = eventType.toLowerCase()

    ensureDocumentListener(normalizedEvent)

    if (!delegatedListeners.has(normalizedEvent))
        delegatedListeners.set(normalizedEvent, new Set())

    const entry = {
        element,
        handler,
        modifiers,
        context,
        expr,
        cleanup: null,
        handlerState: handlerState || { timeoutId: null, throttleTimeoutId: null, lastRun: 0 }
    }

    delegatedListeners.get(normalizedEvent).add(entry)

    return function cleanup() {
        const state = entry.handlerState
        if (state.timeoutId) {
            clearTimeout(state.timeoutId)
            state.timeoutId = null
        }
        if (state.throttleTimeoutId) {
            clearTimeout(state.throttleTimeoutId)
            state.throttleTimeoutId = null
        }

        const listeners = delegatedListeners.get(normalizedEvent)
        if (listeners) {
            listeners.delete(entry)
            if (listeners.size === 0) {
                const docHandler = documentListeners.get(normalizedEvent)
                if (docHandler) {
                    document.removeEventListener(normalizedEvent, docHandler, true)
                    documentListeners.delete(normalizedEvent)
                }
                delegatedListeners.delete(normalizedEvent)
            }
        }
    }
}

export function createEventHandler(handler, modifiers, context, expr, state = null) {
    const timeoutId = { value: null }
    const throttleTimeoutId = { value: null }
    const lastRun = { value: 0 }

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
            if (typeof handler === 'function') {
                handler(e)
            } else {
                evaluateExpression(expr, context, { $event: e }, false)
            }
        })
    }

    return (e) => {
        if (modifiers.includes('prevent')) e.preventDefault()
        if (modifiers.includes('stop')) e.stopPropagation()
        if (modifiers.includes('self') && e.target !== e.currentTarget) return

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
            const remaining = throttleMs - (now - lastRun.value)

            if (remaining <= 0) {
                if (state && state.throttleTimeoutId) clearTimeout(state.throttleTimeoutId)
                else clearTimeout(throttleTimeoutId.value)
                lastRun.value = now
                executeLogic(e)
            } else {
                if (state && state.throttleTimeoutId) clearTimeout(state.throttleTimeoutId)
                else clearTimeout(throttleTimeoutId.value)
                const newTimeoutId = setTimeout(() => {
                    lastRun.value = Date.now()
                    executeLogic(e)
                }, remaining)
                if (state) state.throttleTimeoutId = newTimeoutId
                else throttleTimeoutId.value = newTimeoutId
            }
            if (state) state.lastRun = lastRun.value
            return
        }

        if (debounceMs > 0) {
            if (state && state.timeoutId) clearTimeout(state.timeoutId)
            else clearTimeout(timeoutId.value)
            const newTimeoutId = setTimeout(() => executeLogic(e), debounceMs)
            if (state) state.timeoutId = newTimeoutId
            else timeoutId.value = newTimeoutId
        } else {
            executeLogic(e)
        }
    }
}

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

// Shadow roots registered through installDelegationRoot(), each with its attached handlers.
const delegationRoots = new Set()
// Hosts of closed shadow roots: the document cannot see past them in composedPath().
const closedHosts = new WeakSet()
// Events already dispatched, so a root and the document never both run the same event.
const handledEvents = new WeakSet()

/** Reports whether an event type is handled through document delegation. */
export function isDelegatedEvent(eventName) {
    return DELEGATED_EVENTS.has(eventName.toLowerCase())
}

/** Walks the event path from the target outwards and runs every matching delegated handler. */
function dispatchDelegated(e, eventType) {
    const listeners = delegatedListeners.get(eventType)
    if (!listeners || listeners.size === 0) return

    handledEvents.add(e)

    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    if (path.length > 0) {
        for (const node of path) {
            if (node === document.body || node === document.documentElement || node === document) break
            runEntriesFor(listeners, node, e)
        }
        return
    }

    let target = e.target
    while (target && target !== document.body && target !== document.documentElement) {
        runEntriesFor(listeners, target, e)
        target = target.parentNode
    }
}

/** Runs the delegated handlers registered on one element. */
function runEntriesFor(listeners, element, e) {
    for (const entry of listeners) {
        if (entry.element === element) {
            entry.handler(e)
        }
    }
}

/**
 * Capture-phase handler shared by the document and shadow roots. Skips events whose
 * visible target is a closed-root host: a listener deeper in the tree sees the real
 * target and handles the event in correct bubbling order.
 */
function createCaptureHandler(eventType) {
    return (e) => {
        if (delegationRoots.size > 0 && handledEvents.has(e)) return
        const path = typeof e.composedPath === 'function' ? e.composedPath() : []
        const visibleTarget = path.length > 0 ? path[0] : e.target
        if (closedHosts.has(visibleTarget)) return
        dispatchDelegated(e, eventType)
    }
}

/** Fallback on a closed-root host for events targeting the host itself, which never enter its root. */
function createHostHandler(eventType) {
    return (e) => {
        if (handledEvents.has(e)) return
        dispatchDelegated(e, eventType)
    }
}

/** Attaches the listeners for one event type to a registered shadow root. */
function attachRootListener(rootEntry, eventType) {
    if (rootEntry.handlers.has(eventType)) return

    const rootHandler = createCaptureHandler(eventType)
    rootEntry.root.addEventListener(eventType, rootHandler, true)

    let hostHandler = null
    if (rootEntry.closed) {
        hostHandler = createHostHandler(eventType)
        rootEntry.host.addEventListener(eventType, hostHandler)
    }

    rootEntry.handlers.set(eventType, { rootHandler, hostHandler })
}

/** Removes the listeners for one event type from a registered shadow root. */
function detachRootListener(rootEntry, eventType) {
    const attached = rootEntry.handlers.get(eventType)
    if (!attached) return

    rootEntry.root.removeEventListener(eventType, attached.rootHandler, true)
    if (attached.hostHandler) {
        rootEntry.host.removeEventListener(eventType, attached.hostHandler)
    }
    rootEntry.handlers.delete(eventType)
}

/**
 * Makes delegated events work inside a shadow root. Open roots already work through
 * composedPath(); closed roots need this, because the document only sees their host.
 * Returns a function that unregisters the root.
 */
export function installDelegationRoot(root) {
    const host = root.host
    const rootEntry = {
        root,
        host,
        closed: root.mode === 'closed',
        handlers: new Map()
    }

    if (rootEntry.closed) closedHosts.add(host)
    delegationRoots.add(rootEntry)

    for (const eventType of documentListeners.keys()) {
        attachRootListener(rootEntry, eventType)
    }

    return function uninstall() {
        for (const eventType of [...rootEntry.handlers.keys()]) {
            detachRootListener(rootEntry, eventType)
        }
        delegationRoots.delete(rootEntry)
        if (rootEntry.closed) closedHosts.delete(host)
    }
}

/** Installs one capturing document listener for a delegated event type. */
function ensureDocumentListener(eventType) {
    if (documentListeners.has(eventType)) {
        return
    }

    const handler = createCaptureHandler(eventType)

    document.addEventListener(eventType, handler, true)
    documentListeners.set(eventType, handler)

    for (const rootEntry of delegationRoots) {
        attachRootListener(rootEntry, eventType)
    }
}

/** Registers an element handler in the delegated event registry. */
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
                for (const rootEntry of delegationRoots) {
                    detachRootListener(rootEntry, normalizedEvent)
                }
                delegatedListeners.delete(normalizedEvent)
            }
        }
    }
}

/** Builds an event callback with modifier, keyboard, debounce, and throttle behavior. */
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

import { config } from "./comet-config.js";
import { ATTR, METHOD_ATTRS, DEFAULT_TRIGGER_BY_TAG } from "./comet-methods.js";

export { config, ATTR };

// --- Event dispatch ---------------------------------------------------

/**
 * Dispatches a `comet:<name>` CustomEvent on el, bubbling, cancelable.
 * Returns the event so callers can check `.defaultPrevented`.
 */
function fire(el, name, detail) {
    const event = new CustomEvent(`comet:${name}`, {
        detail,
        bubbles: true,
        cancelable: true,
    })
    el.dispatchEvent(event)
    return event
}

// --- Trigger spec parsing ---------------------------------------------

/**
 * Parses a comet-trigger value into an array of trigger specs.
 * Supports comma-separated multiple triggers, "every Xs" polling,
 * "load" (fire once on init), and modifiers: delay:Xms, throttle:Xms,
 * changed, once, from:<selector>.
 *
 * "keyup changed delay:500ms" -> { event: 'keyup', changed: true, delay: 500 }
 * "every 2s"                  -> { poll: 2000 }
 * "load"                      -> { event: 'load' } (handled specially: fires immediately)
 */
export function parseTriggerSpec(raw) {
    if (!raw || !raw.trim()) return [{ event: null }]
    return raw.split(',').map(part => parseSingleTrigger(part.trim())).filter(Boolean)
}

function parseSingleTrigger(part) {
    if (!part) return null
    const tokens = part.split(/\s+/)
    const first = tokens[0]

    if (first === 'every') {
        const ms = parseDuration(tokens[1]) ?? 1000
        return { poll: ms }
    }

    const spec = { event: first, once: false, changed: false, delay: 0, throttle: 0, from: null }
    for (const tok of tokens.slice(1)) {
        if (tok === 'once') spec.once = true
        else if (tok === 'changed') spec.changed = true
        else if (tok.startsWith('delay:')) spec.delay = parseDuration(tok.slice(6)) ?? 0
        else if (tok.startsWith('throttle:')) spec.throttle = parseDuration(tok.slice(9)) ?? 0
        else if (tok.startsWith('from:')) spec.from = tok.slice(5)
    }
    return spec
}

function parseDuration(s) {
    if (!s) return null
    const m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(s.trim())
    if (!m) return null
    const n = parseFloat(m[1])
    return m[2] === 's' ? n * 1000 : n
}

// --- Request config -----------------------------------------------------

/** Returns { method, url } from whichever comet-<method> attribute is present, or null. */
export function getRequestConfig(el) {
    for (const [method, attr] of METHOD_ATTRS) {
        if (el.hasAttribute(attr)) {
            return { method, url: el.getAttribute(attr) }
        }
    }
    return null
}

function resolveDefaultEvent(el) {
    return DEFAULT_TRIGGER_BY_TAG[el.tagName] || 'click'
}

// --- Param gathering ------------------------------------------------------

/**
 * Gathers request parameters for el: form fields (if el is a form, or
 * the triggering element is inside one and no comet-get/post is on the
 * form itself — kept simple in Phase 1: only el's OWN form, if el IS a
 * form), comet-vals (JSON), comet-include (selector, gathers name/value
 * pairs from matches), and el's own name/value if it has both.
 */
export function gatherParams(el) {
    const params = new URLSearchParams()

    if (el.tagName === 'FORM') {
        const fd = new FormData(el)
        for (const [k, v] of fd.entries()) {
            if (typeof v === 'string') params.append(k, v)
        }
    } else if (el.name && el.value !== undefined) {
        params.append(el.name, el.value)
    }

    const includeSel = el.getAttribute(ATTR.include)
    if (includeSel) {
        const root = el.ownerDocument
        root.querySelectorAll(includeSel).forEach(node => {
            if (node.name && node.value !== undefined) {
                params.append(node.name, node.value)
            }
        })
    }

    const valsRaw = el.getAttribute(ATTR.vals)
    if (valsRaw) {
        try {
            const vals = JSON.parse(valsRaw)
            for (const [k, v] of Object.entries(vals)) {
                params.append(k, String(v))
            }
        } catch (e) {
            console.warn(`[comet] invalid comet-vals JSON on`, el, e)
        }
    }

    return params
}

// --- Swap ------------------------------------------------------------

/**
 * Performs the actual DOM swap. `mode` is one of: innerHTML, outerHTML,
 * beforebegin, afterbegin, beforeend, afterend, delete, none.
 * Returns the list of newly-inserted top-level nodes (for re-processing),
 * or [] for delete/none/innerHTML-of-nothing-new-at-top-level cases where
 * re-processing should instead happen on `target` itself (innerHTML) or
 * nothing (delete/none).
 */
export function swap(target, html, mode) {
    switch (mode) {
        case 'none':
            return []
        case 'delete':
            target.remove()
            return []
        case 'outerHTML': {
            const parent = target.parentNode
            const tpl = target.ownerDocument.createElement('template')
            tpl.innerHTML = html
            const nodes = Array.from(tpl.content.childNodes)
            parent.replaceChild(tpl.content, target)
            return nodes
        }
        case 'beforebegin':
        case 'afterbegin':
        case 'beforeend':
        case 'afterend': {
            const tpl = target.ownerDocument.createElement('template')
            tpl.innerHTML = html
            const nodes = Array.from(tpl.content.childNodes)
            target.insertAdjacentHTML(mode, html)
            return nodes
        }
        case 'innerHTML':
        default:
            target.innerHTML = html
            return [target]
    }
}

/**
 * Finds every element in `html` carrying comet-swap-oob, removes it from
 * the main fragment, and returns { mainHTML, oobSwaps: [{el, mode, targetSelector}] }
 * so the caller can perform the OOB swaps separately from the main one.
 *
 * comet-swap-oob="true"        -> mode "outerHTML", target "#<the element's own id>"
 * comet-swap-oob="innerHTML"   -> mode "innerHTML", target "#<the element's own id>"
 * comet-swap-oob="innerHTML:#foo" -> mode "innerHTML", target "#foo"
 */
export function extractOOBSwaps(html, doc) {
    const tpl = doc.createElement('template')
    tpl.innerHTML = html

    const oobEls = Array.from(tpl.content.querySelectorAll(`[${ATTR.swapOob}]`))
    const oobSwaps = []

    for (const el of oobEls) {
        const raw = el.getAttribute(ATTR.swapOob)
        let mode = 'outerHTML'
        let targetSelector = el.id ? `#${el.id}` : null

        if (raw && raw !== 'true') {
            const parts = raw.split(':')
            mode = parts[0]
            if (parts[1]) targetSelector = parts[1]
        }

        el.removeAttribute(ATTR.swapOob)
        el.remove()
        oobSwaps.push({ el, mode, targetSelector })
    }

    return { mainHTML: tpl.innerHTML, oobSwaps }
}

// --- Indicator / confirm ------------------------------------------------

function getIndicatorEl(el) {
    const sel = el.getAttribute(ATTR.indicator)
    if (!sel) return el
    return el.ownerDocument.querySelector(sel) || el
}

// --- Core request pipeline ---------------------------------------------

const inFlightPollers = new WeakMap() // element -> interval id, for cleanup

/**
 * Fires the request configured on `el`, using `triggerEvent` (may be
 * null for programmatic/poll-driven calls) for header/context info.
 */
export async function performRequest(el, triggerEvent) {
    const reqConfig = getRequestConfig(el)
    if (!reqConfig) return

    const confirmMsg = el.getAttribute(ATTR.confirm)
    if (confirmMsg && typeof el.ownerDocument.defaultView?.confirm === 'function') {
        if (!el.ownerDocument.defaultView.confirm(confirmMsg)) return
    }

    const targetSel = el.getAttribute(ATTR.target)
    let target = targetSel ? el.ownerDocument.querySelector(targetSel) : el
    if (!target) target = el

    const swapMode = el.getAttribute(ATTR.swap) || config.defaultSwap

    const params = gatherParams(el)

    const requestDetail = {
        method: reqConfig.method,
        url: reqConfig.url,
        params,
        headers: {
            'Comet-Request': 'true',
            'Comet-Trigger': triggerEvent ? triggerEvent.type : '',
            'Comet-Target': targetSel || '',
        },
        target,
        swapMode,
    }

    const configEvent = fire(el, 'configRequest', requestDetail)
    if (configEvent.defaultPrevented) return

    const beforeEvent = fire(el, 'beforeRequest', requestDetail)
    if (beforeEvent.defaultPrevented) return

    const indicatorEl = getIndicatorEl(el)
    indicatorEl.classList.add(config.requestingClass)

    let url = requestDetail.url
    let fetchOpts = {
        method: requestDetail.method.toUpperCase(),
        headers: requestDetail.headers,
    }

    if (requestDetail.method === 'get') {
        const qs = params.toString()
        if (qs) url += (url.includes('?') ? '&' : '?') + qs
    } else {
        fetchOpts.body = params
    }

    let controller = null
    if (config.timeout > 0) {
        controller = new AbortController()
        fetchOpts.signal = controller.signal
        setTimeout(() => controller.abort(), config.timeout)
    }

    let response
    try {
        response = await fetch(url, fetchOpts)
    } catch (err) {
        indicatorEl.classList.remove(config.requestingClass)
        fire(el, 'sendError', { ...requestDetail, error: err })
        return
    }

    indicatorEl.classList.remove(config.requestingClass)

    fire(el, 'afterRequest', { ...requestDetail, response })

    if (!response.ok) {
        const errEvent = fire(el, 'responseError', { ...requestDetail, response })
        if (errEvent.defaultPrevented) return
        console.warn(`[comet] request to ${url} failed with status ${response.status}`)
        return
    }

    await handleResponse(el, response, requestDetail)
}

async function handleResponse(el, response, requestDetail) {
    const doc = el.ownerDocument

    const redirect = response.headers.get('Comet-Redirect')
    if (redirect) {
        doc.defaultView.location.assign(redirect)
        return
    }

    let target = requestDetail.target
    const retarget = response.headers.get('Comet-Retarget')
    if (retarget) {
        target = doc.querySelector(retarget) || target
    }

    let swapMode = requestDetail.swapMode
    const reswap = response.headers.get('Comet-Reswap')
    if (reswap) swapMode = reswap

    const html = await response.text()

    const { mainHTML, oobSwaps } = extractOOBSwaps(html, doc)

    const swapEvent = fire(el, 'beforeSwap', { ...requestDetail, target, swapMode, html: mainHTML })
    if (swapEvent.defaultPrevented) return

    cleanupTarget(target, swapMode, el, requestDetail)

    const newNodes = swap(target, mainHTML, swapMode)
    for (const node of newNodes) {
        hydrateNode(node, el, requestDetail)
    }

    for (const { el: oobEl, mode, targetSelector } of oobSwaps) {
        if (!targetSelector) continue
        const oobTarget = doc.querySelector(targetSelector)
        if (!oobTarget) continue

        cleanupTarget(oobTarget, mode, el, requestDetail)

        const oobHTML = mode === 'outerHTML' ? oobEl.outerHTML : oobEl.innerHTML
        const oobNewNodes = swap(oobTarget, oobHTML, mode)
        for (const node of oobNewNodes) {
            hydrateNode(node, el, requestDetail)
        }
    }

    fire(el, 'afterSwap', { ...requestDetail, target, swapMode })

    const pushUrl = response.headers.get('Comet-Push-Url') || el.getAttribute(ATTR.pushUrl)
    if (pushUrl && pushUrl !== 'false') {
        const url = pushUrl === 'true' ? requestDetail.url : pushUrl
        doc.defaultView.history.pushState({ comet: true }, '', url)
    }
}

function cleanupTarget(target, mode, el, detail) {
    if (!target) return
    fire(target, 'cleanup', { ...detail, target, mode, triggerEl: el })
    if (typeof config.cleanup === 'function') {
        try {
            config.cleanup(target, mode)
        } catch (err) {
            console.error('[comet] error in cleanup hook:', err)
        }
    }
}

function hydrateNode(node, el, detail) {
    if (node.nodeType === 1) {
        if (typeof config.hydrator === 'function') {
            try {
                config.hydrator(node, { ...detail, triggerEl: el })
            } catch (err) {
                console.error('[comet] error in hydrator hook:', err)
            }
        }
        fire(node, 'hydrate', { ...detail, node, triggerEl: el })
        process(node)
    }
}

/** Registers a custom hydrator hook function. */
export function setHydrator(fn) {
    config.hydrator = fn
}

/** Registers a custom cleanup hook function. */
export function setCleanup(fn) {
    config.cleanup = fn
}

// --- Wiring --------------------------------------------------------------

const wired = new WeakSet()

/**
 * Wires a single element that has a comet-<method> attribute: attaches
 * its trigger listener(s), or starts its poller, or fires immediately
 * for a "load" trigger. Idempotent — calling this twice on the same
 * element is a no-op the second time.
 */
export function wireElement(el) {
    if (wired.has(el)) return
    wired.add(el)

    const reqConfig = getRequestConfig(el)
    if (!reqConfig) return

    const specs = parseTriggerSpec(el.getAttribute(ATTR.trigger))

    for (const spec of specs) {
        if (spec.poll !== undefined) {
            startPolling(el, spec.poll)
            continue
        }

        const eventName = spec.event || resolveDefaultEvent(el)

        if (eventName === 'load') {
            queueMicrotask(() => performRequest(el, null))
            continue
        }

        attachTriggerListener(el, eventName, spec)
    }
}

function attachTriggerListener(el, eventName, spec) {
    let lastValue = el.value
    let throttling = false
    let debounceTimer = null

    const handler = (evt) => {
        if (spec.from && evt.target !== el && !(evt.target.closest && evt.target.closest(spec.from))) {
            return
        }
        if (spec.changed && el.value === lastValue) return
        lastValue = el.value

        if (eventName === 'submit') evt.preventDefault()

        const run = () => {
            if (spec.throttle > 0) {
                if (throttling) return
                throttling = true
                setTimeout(() => { throttling = false }, spec.throttle)
            }
            performRequest(el, evt)
        }

        if (spec.delay > 0) {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(run, spec.delay)
        } else {
            run()
        }

        if (spec.once) el.removeEventListener(eventName, handler)
    }

    el.addEventListener(eventName, handler)
}

function startPolling(el, intervalMs) {
    if (inFlightPollers.has(el)) return
    const id = setInterval(() => {
        if (!el.isConnected) {
            clearInterval(id)
            inFlightPollers.delete(el)
            return
        }
        performRequest(el, null)
    }, intervalMs)
    inFlightPollers.set(el, id)
}

// --- Public scan/init API -------------------------------------------------

const REQUEST_ATTR_SELECTOR = METHOD_ATTRS.map(([, attr]) => `[${attr}]`).join(',')

/** Wires a single element and, separately, recurses into its descendants. Safe to call on already-wired elements/subtrees. */
export function process(el) {
    if (el.nodeType !== 1) return
    if (el.matches && el.matches(REQUEST_ATTR_SELECTOR)) {
        wireElement(el)
    }
    if (el.querySelectorAll) {
        el.querySelectorAll(REQUEST_ATTR_SELECTOR).forEach(wireElement)
    }
}

let observer = null

/** Scans root for comet-* elements and wires them, then starts a MutationObserver on root for future additions. */
export function init(root) {
    if (!root) return
    process(root)

    if (typeof MutationObserver === 'undefined') return
    if (observer) observer.disconnect()

    observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) process(node)
            })
        }
    })
    observer.observe(root, { childList: true, subtree: true })
}

export function stopObserving() {
    if (observer) {
        observer.disconnect()
        observer = null
    }
}

// --- Auto-init in a real browser environment ------------------------------

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__COMET_NO_AUTO_INIT__) {
    const start = () => init(document.body)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start)
    } else {
        start()
    }
    window.Comet = { init, process, config, parseTriggerSpec, getRequestConfig, gatherParams, swap, extractOOBSwaps, setHydrator, setCleanup }
}
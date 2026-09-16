import { JSDOM } from 'jsdom'

/**
 * Sets up jsdom-backed globals for a test file and returns { window, document }.
 * Must be called (and its result awaited via dynamic import of comet.js)
 * BEFORE importing '../src/comet.js', since that module's auto-init logic
 * runs at import time and checks `typeof window`.
 */
export function setupDom(html = '<!doctype html><html><body></body></html>') {
    const dom = new JSDOM(html, { url: 'http://localhost/' })
    const { window } = dom

    // __COMET_NO_AUTO_INIT__ must be set before comet.js is imported.
    window.__COMET_NO_AUTO_INIT__ = true

    global.window = window
    global.document = window.document
    global.CustomEvent = window.CustomEvent
    global.MutationObserver = window.MutationObserver
    global.HTMLElement = window.HTMLElement
    global.Node = window.Node
    // jsdom's FormData (NOT Node's built-in) is required for
    // `new FormData(formElement)` to actually read the form's fields —
    // Node's global FormData throws on that constructor form entirely.
    global.FormData = window.FormData
    // Real network fetch (Node's built-in), so requests actually hit a
    // real local HTTP server rather than being mocked.
    global.fetch = fetch
    global.URLSearchParams = URLSearchParams
    global.AbortController = AbortController

    return { window, document: window.document }
}

export function cleanupDom() {
    document.body.innerHTML = ''
}
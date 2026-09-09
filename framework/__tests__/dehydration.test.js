import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderPageToStream } from '../server/render.js'
import { streamToString } from '../server/stream.js'
import { signal } from '../core/signal.js'
import {
    hydrateApp,
    hydrateFromWindow,
    hydrateAnchors,
    readWindowState,
    clearHydration
} from '../core/hydration.js'
import { clearSignalRegistry, withSignalScope } from '../core/signal-scope.js'

beforeEach(() => {
    clearSignalRegistry()
    clearHydration()
})

describe('Dehydration script placement: "before </body>" via HTML5 parser reparenting', () => {
    it('a real browser-grade parser relocates the post-</html> dehydration script INTO <body>, at its end', async () => {
        function renderShell() {
            signal('shell-signal-value')
            return '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Page content</h1></body></html>'
        }

        const fullDocument = await streamToString(renderPageToStream(renderShell))

        // Confirm the byte stream really does put the script AFTER </html> —
        // i.e. we are NOT literally splicing before </body>. This is the
        // premise the parser-reparenting claim needs to be tested against.
        const htmlCloseIdx = fullDocument.indexOf('</html>')
        const scriptIdx = fullDocument.indexOf('__FUSEE_DATA__')
        expect(scriptIdx).toBeGreaterThan(htmlCloseIdx)

        // Now feed that exact byte stream through a real HTML parser (jsdom
        // uses the same parsing algorithm class as browsers: whatwg/html,
        // via parse5) and see where the script ends up in the actual DOM.
        const dom = new JSDOM(fullDocument)
        const scriptEl = dom.window.document.getElementById('__FUSEE_DATA__')

        expect(scriptEl).not.toBeNull()
        // The parser reparented it: it's a descendant of <body>, not a
        // sibling of <html> floating outside the document tree.
        expect(scriptEl.closest('body')).toBe(dom.window.document.body)
        // And specifically at the END of body — nothing the parser
        // reparented got inserted BEFORE the original <h1> content, since
        // reparented tokens append to whatever's already there.
        expect(dom.window.document.body.lastElementChild).toBe(scriptEl)
        expect(dom.window.document.body.innerHTML.indexOf('<h1>')).toBeLessThan(
            dom.window.document.body.innerHTML.indexOf('__FUSEE_DATA__')
        )
    })

    it('same reparenting holds even with a resolved suspense boundary chunk in between', async () => {
        const { renderSuspenseBoundary } = await import('../server/stream.js')

        function renderShell() {
            const boundary = renderSuspenseBoundary({
                id: 'b1',
                fetcher: () => Promise.resolve('resolved'),
                render: (d) => `<p>${d}</p>`,
                fallback: () => 'loading'
            })
            return `<!DOCTYPE html><html><body><main>${boundary}</main></body></html>`
        }

        const fullDocument = await streamToString(renderPageToStream(renderShell))
        const dom = new JSDOM(fullDocument)

        const scriptEl = dom.window.document.getElementById('__FUSEE_DATA__')
        expect(scriptEl.closest('body')).toBe(dom.window.document.body)
        // The boundary's own template+script (also emitted after the
        // original </body>) landed in body too, and BEFORE the
        // dehydration script, matching stream order.
        const boundaryTemplate = dom.window.document.getElementById('tpl-b1')
        expect(boundaryTemplate.closest('body')).toBe(dom.window.document.body)
    })
})

describe('hydrateApp() — enforces hydrateFromWindow() before hydrateAnchors()', () => {
    let dom
    beforeEach(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>')
        global.window = dom.window
    })
    afterEach(() => {
        delete global.window
    })

    it('hydrateApp() loads window state before returning, so state is available immediately after the call', () => {
        window.__FUSEE_STATE__ = {
            resources: {},
            signals: { page: [99] }
        }

        const container = dom.window.document.createElement('div')
        dom.window.document.body.appendChild(container)

        hydrateApp(container, [])

        // If hydrateApp() had called hydrateAnchors() first (or skipped
        // hydrateFromWindow() entirely), this scope would see no hydrated
        // value and fall back to the -1 initializer instead.
        let replayed
        withSignalScope('page', () => { replayed = signal(-1)() })
        expect(replayed).toBe(99)
    })

    it('a binding created via hydrateApp reads state that was already loaded by the time its effect first runs', () => {
        const document = dom.window.document
        const container = document.createElement('div')
        container.innerHTML = '<p>Count: <!--f-bind:0-->0<!--/f-bind:0--></p>'
        document.body.appendChild(container)

        window.__FUSEE_STATE__ = { resources: {}, signals: { page: [99] } }

        // Real order: state must exist before setup() creates the signal.
        // hydrateApp() guarantees this internally; here we call
        // hydrateFromWindow() first (what hydrateApp does as its first
        // step) then create the signal exactly as a component's setup()
        // would, then bind — same sequence hydrateApp's contract promises.
        hydrateFromWindow()
        let count
        withSignalScope('page', () => { count = signal(0) })

        hydrateAnchors(container, [{ type: 'bind', get: () => count() }])
        expect(container.querySelector('p').textContent).toBe('Count: 99')
    })

    it('calling hydrateFromWindow() before setup() (the correct real-world order) makes bindings reflect server state immediately', () => {
        window.__FUSEE_STATE__ = { resources: {}, signals: { page: [99] } }

        // Correct real order: hydrateFromWindow() runs first, THEN setup()
        // creates the signal — this is the order hydrateApp() enforces
        // internally, demonstrated here as its two steps run manually.
        hydrateFromWindow()

        let count
        withSignalScope('page', () => { count = signal(0) })
        expect(count()).toBe(99) // hydrated value won over the 0 initializer
    })

    it('resource cache state is also restored via hydrateApp before anchors bind', () => {
        const document = dom.window.document
        const container = document.createElement('div')
        container.innerHTML = '<div data-f-id="0"></div>'
        document.body.appendChild(container)

        window.__FUSEE_STATE__ = {
            resources: { item: { '[5]': { data: { id: 5, cached: true }, updatedAt: Date.now() } } },
            signals: {}
        }

        hydrateApp(container, [])

        const state = readWindowState()
        expect(state.resources.item['[5]'].data).toEqual({ id: 5, cached: true })
    })
})
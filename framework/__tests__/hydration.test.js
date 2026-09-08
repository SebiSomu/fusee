import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { withRequestContext, createRequestContext } from '../server/index.js'
import {
    withSignalScope,
    loadSignalRegistry,
    extractSignalRegistrySnapshot,
    clearSignalRegistry
} from '../core/signal-scope.js'
import { signal } from '../core/signal.js'
import {
    renderDehydrationScript,
    readWindowState,
    hydrateFromWindow,
    hydrateAnchors,
    clearHydration
} from '../core/hydration.js'
import { defineResource } from '../core/resource.js'
import { renderPageSSR } from '../server/ssr-render.js'
import { findAnchors, flattenAnchors } from '../core/dom-anchors.js'

beforeEach(() => {
    clearSignalRegistry()
    clearHydration()
})

describe('signal-scope: positional recording (SSR side)', () => {
    it('records each signal() call under its scope in call order', () => {
        withSignalScope('page', () => {
            signal('a')
            signal('b')
            signal(3)
        })

        const snapshot = extractSignalRegistrySnapshot()
        expect(snapshot.page).toEqual(['a', 'b', 3])
    })

    it('keeps separate scopes independent (different component instances)', () => {
        withSignalScope('comp-1', () => signal('one'))
        withSignalScope('comp-2', () => signal('two'))

        const snapshot = extractSignalRegistrySnapshot()
        expect(snapshot['comp-1']).toEqual(['one'])
        expect(snapshot['comp-2']).toEqual(['two'])
    })

    it('signal() calls outside any scope are unaffected (no scope, no recording)', () => {
        const s = signal('untracked')
        expect(s()).toBe('untracked')
        expect(extractSignalRegistrySnapshot()).toEqual({})
    })

    it('nested scopes (component inside component) each get their own slot counter', () => {
        withSignalScope('outer', () => {
            signal('outer-1')
            withSignalScope('inner', () => {
                signal('inner-1')
                signal('inner-2')
            })
            signal('outer-2')
        })

        const snapshot = extractSignalRegistrySnapshot()
        expect(snapshot.outer).toEqual(['outer-1', 'outer-2'])
        expect(snapshot.inner).toEqual(['inner-1', 'inner-2'])
    })
})

describe('signal-scope: positional replay (client hydration side)', () => {
    it('returns the hydrated value instead of the initializer arg', () => {
        loadSignalRegistry({ page: ['server-value'] })

        const expensiveInit = vi.fn(() => 'recomputed-value')
        let s
        withSignalScope('page', () => {
            s = signal(expensiveInit())
        })

        // Note: the initializer is a plain JS argument, so it DOES get
        // evaluated (signal(expensiveInit()) calls expensiveInit() before
        // signal() ever runs) — resolveSignalValue can only ignore the
        // RESULT, not prevent the call. Real "skip the fetch" savings
        // need the caller to guard the expensive work itself (e.g.
        // `signal(hydrated ? undefined : expensiveInit())`) — flagging
        // this rather than implying any initializer becomes free.
        expect(expensiveInit).toHaveBeenCalledTimes(1)
        expect(s()).toBe('server-value')
    })

    it('falls back to the provided initial value when no hydrated value exists at that slot', () => {
        loadSignalRegistry({ page: ['only-one'] })

        const values = []
        withSignalScope('page', () => {
            values.push(signal('replayed')())
            values.push(signal('fresh-signal-added-on-client')())
        })

        expect(values).toEqual(['only-one', 'fresh-signal-added-on-client'])
    })

    it('round-trips: record on "server", load into a fresh registry, replay on "client"', () => {
        withSignalScope('counter-widget', () => {
            signal(0)
            signal('idle')
        })
        const dehydrated = extractSignalRegistrySnapshot()

        clearSignalRegistry() // simulate a fresh page load
        loadSignalRegistry(dehydrated)

        const replayed = []
        withSignalScope('counter-widget', () => {
            replayed.push(signal(999)()) // initial arg ignored in favor of hydrated 0
            replayed.push(signal('placeholder')())
        })

        expect(replayed).toEqual([0, 'idle'])
    })
})

describe('signal-scope: request isolation', () => {
    it('does not leak signal state between concurrent request contexts', async () => {
        function delay(ms, v) { return new Promise(r => setTimeout(() => r(v), ms)) }

        async function runRequest(userId, ms) {
            const ctx = createRequestContext()
            return withRequestContext(ctx, async () => {
                await delay(ms)
                withSignalScope('user-widget', () => {
                    signal(`value-for-${userId}`)
                })
                return extractSignalRegistrySnapshot()
            })
        }

        const [a, b] = await Promise.all([runRequest('A', 15), runRequest('B', 5)])
        expect(a['user-widget']).toEqual(['value-for-A'])
        expect(b['user-widget']).toEqual(['value-for-B'])
    })
})

describe('renderDehydrationScript / readWindowState round-trip', () => {
    let dom
    beforeEach(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>')
        global.window = dom.window
    })
    afterEach(() => {
        delete global.window
    })

    it('combines resource cache data and signal state into one script tag', async () => {
        const useThing = defineResource('thing', async (id) => ({ id, ok: true }))

        let scriptTag
        await renderPageSSR(async () => {
            withSignalScope('page', () => signal('hello'))
            const { data } = useThing(1)
            scriptTag = renderDehydrationScript()
            return data()
        })

        expect(scriptTag).toContain('id="__FUSEE_DATA__"')
        expect(scriptTag).toContain('window.__FUSEE_STATE__')
        expect(scriptTag).toContain('"thing"')
        expect(scriptTag).toContain('"page"')
    })

    it('escapes </script> inside serialized data so the tag cannot be broken out of', () => {
        withSignalScope('danger', () => signal('</script><script>alert(1)</script>'))
        const tag = renderDehydrationScript()
        expect(tag).not.toMatch(/<\/script>[^<]*<script>alert/)
        expect(tag).toContain('<\\/script>')
    })

    it('hydrateFromWindow reads the new __FUSEE_STATE__ shape into both registries', () => {
        window.__FUSEE_STATE__ = {
            resources: { thing: { '[1]': { data: { id: 1 }, updatedAt: Date.now() } } },
            signals: { page: ['restored'] }
        }

        hydrateFromWindow()

        expect(readWindowState().resources.thing['[1]'].data).toEqual({ id: 1 })

        let replayed
        withSignalScope('page', () => { replayed = signal('ignored')() })
        expect(replayed).toBe('restored')
    })

    it('falls back to the legacy __FUSEE_HYDRATION__ key when present without __FUSEE_STATE__', () => {
        window.__FUSEE_HYDRATION__ = { legacyThing: { k: { data: 'old', updatedAt: 1 } } }
        expect(() => hydrateFromWindow()).not.toThrow()
    })
})

describe('hydrateAnchors — attaching behavior to the SSR-rendered DOM tree', () => {
    let dom, document

    beforeEach(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>')
        document = dom.window.document
        global.window = dom.window
    })
    afterEach(() => {
        delete global.window
    })

    it('finds a f-bind anchor pair and updates its existing text node reactively', () => {
        const container = document.createElement('div')
        container.innerHTML = '<p>Hello, <!--f-bind:0-->Ana<!--/f-bind:0--></p>'
        document.body.appendChild(container)

        // childNodes: [0]="Hello, " [1]=<!--f-bind:0--> [2]="Ana" [3]=<!--/f-bind:0-->
        const originalTextNode = container.querySelector('p').childNodes[2]
        expect(originalTextNode.nodeType).toBe(3)

        const nameSignal = signal('Ana')
        const dispose = hydrateAnchors(container, [
            { type: 'bind', get: () => nameSignal() }
        ])

        expect(container.querySelector('p').textContent).toBe('Hello, Ana')

        nameSignal('Bob')
        expect(container.querySelector('p').textContent).toBe('Hello, Bob')
        // Same text node reused — not recreated — per the "no re-parsing/recreating" goal.
        expect(container.querySelector('p').childNodes[2]).toBe(originalTextNode)

        dispose()
    })

    it('attaches reactive attributes to a data-f-id element without touching its children', () => {
        const container = document.createElement('div')
        container.innerHTML = '<button data-f-id="0" disabled>Save</button>'
        document.body.appendChild(container)
        const btn = container.querySelector('button')
        const originalChild = btn.firstChild

        const pending = signal(true)
        hydrateAnchors(container, [
            { type: 'attrs', get: () => ({ disabled: pending() }) }
        ])

        expect(btn.hasAttribute('disabled')).toBe(true)
        pending(false)
        expect(btn.hasAttribute('disabled')).toBe(false)
        expect(btn.firstChild).toBe(originalChild)
    })

    it('swaps content between a f-if anchor pair when the active branch changes', () => {
        const container = document.createElement('div')
        container.innerHTML = '<!--f-if:0--><span>Logged out</span><!--/f-if:0-->'
        document.body.appendChild(container)

        const loggedIn = signal(false)
        hydrateAnchors(container, [
            {
                type: 'if',
                branches: [
                    { cond: () => loggedIn(), render: () => '<span>Welcome back</span>' },
                    { cond: () => true, render: () => '<span>Logged out</span>' }
                ]
            }
        ])

        expect(container.textContent).toBe('Logged out')
        loggedIn(true)
        expect(container.textContent).toBe('Welcome back')
        loggedIn(false)
        expect(container.textContent).toBe('Logged out')
    })

    it('findAnchors reports anchors in document order matching multiple kinds', () => {
        const container = document.createElement('div')
        container.innerHTML =
            '<div data-f-id="0"></div>' +
            '<span><!--f-bind:1-->x<!--/f-bind:1--></span>' +
            '<!--f-if:2--><p>a</p><!--/f-if:2-->'
        document.body.appendChild(container)

        const anchors = flattenAnchors(findAnchors(container))
        expect(anchors.map(a => a.type)).toEqual(['element', 'f-bind', 'f-if'])
    })
})
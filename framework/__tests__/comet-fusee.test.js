import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { setupDom, cleanupDom } from './comet-helpers/setup.js'
import { startTestServer } from './comet-helpers/test-server.js'
import * as comet from '../core/comet-js/comet.js'
import { enableFuseeHydration, extractAndApplyEmbeddedState, cleanupFragment } from '../core/comet-js/comet-fusee.js'
import { signal } from '../core/signal.js'
import { defineComponent, onMount, onUnmount } from '../core/component.js'
import { getHydratedEntries } from '../core/hydration.js'

let testServer

beforeAll(async () => {
    setupDom()
    testServer = await startTestServer({
        'GET /reactive-counter': (req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<div id="count-box"><span id="val">{{ count }}</span></div>')
        },
        'GET /component-box': (req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<div data-component="Counter" data-prop-init="10"></div>')
        },
        'GET /state-fragment': (req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(`
                <div id="frag">Hello</div>
                <script id="__FUSEE_DATA__">window.__FUSEE_STATE__ = {"resources":{"userKey":{"1":{"data":{"name":"Alice"},"updatedAt":123456}}}};</script>
            `)
        },
    })
})

afterAll(async () => {
    await testServer.close()
})

beforeEach(() => {
    cleanupDom()
})

describe('Fusée + Comet Hydration Bridge', () => {
    it('automatically compiles and hydrates reactive mustaches in swapped fragments', async () => {
        const count = signal(0)
        const disable = enableFuseeHydration({ context: { count } })

        document.body.innerHTML = `
            <button comet-get="${testServer.url}/reactive-counter" comet-target="#out" comet-swap="innerHTML"></button>
            <div id="out"></div>
        `

        const btn = document.querySelector('button')
        await comet.performRequest(btn, null)

        const val = document.getElementById('val')
        expect(val).not.toBeNull()
        expect(val.textContent).toBe('0')

        count(5)
        expect(val.textContent).toBe('5')

        count(42)
        expect(val.textContent).toBe('42')

        disable()
    })

    it('mounts Fusée components in swapped-in fragments and passes props', async () => {
        let mounted = false
        const Counter = defineComponent({
            props: { init: { default: 0 } },
            setup(props) {
                const count = signal(props.init || 0)
                onMount(() => { mounted = true })
                return {
                    count,
                    template: '<button id="btn-count">Count: {{ count }}</button>'
                }
            }
        })

        const disable = enableFuseeHydration({ components: { Counter } })

        document.body.innerHTML = `
            <button id="load-btn" comet-get="${testServer.url}/component-box" comet-target="#out" comet-swap="innerHTML"></button>
            <div id="out"></div>
        `

        const loadBtn = document.getElementById('load-btn')
        await comet.performRequest(loadBtn, null)

        expect(mounted).toBe(true)
        const countBtn = document.getElementById('btn-count')
        expect(countBtn).not.toBeNull()
        expect(countBtn.textContent).toContain('10')

        disable()
    })

    it('cleans up reactive effects and unmounts components when target is swapped out', async () => {
        let unmounted = false
        const Counter = defineComponent({
            setup() {
                onUnmount(() => { unmounted = true })
                return {
                    template: '<div id="c-inner">Inner Component</div>'
                }
            }
        })

        const disable = enableFuseeHydration({ components: { Counter } })

        document.body.innerHTML = `
            <div id="out"></div>
        `
        const out = document.getElementById('out')
        out.innerHTML = '<div data-component="Counter"></div>'
        
        // Hydrate initial component
        comet.config.hydrator?.(out, {})

        expect(document.getElementById('c-inner')).not.toBeNull()

        // Cleanup and swap
        cleanupFragment(out)
        comet.swap(out, '<span>New content</span>', 'innerHTML')

        expect(unmounted).toBe(true)
        expect(document.getElementById('c-inner')).toBeNull()

        disable()
    })

    it('extracts and ingests embedded hydration state payloads from fragments', async () => {
        const disable = enableFuseeHydration()

        document.body.innerHTML = `
            <button id="state-btn" comet-get="${testServer.url}/state-fragment" comet-target="#out" comet-swap="innerHTML"></button>
            <div id="out"></div>
        `

        const btn = document.getElementById('state-btn')
        await comet.performRequest(btn, null)

        expect(document.getElementById('frag').textContent).toBe('Hello')
        expect(document.getElementById('__FUSEE_DATA__')).toBeNull()

        const hydrated = getHydratedEntries('userKey')
        expect(hydrated).not.toBeNull()
        expect(hydrated.get('1')).toEqual({ data: { name: 'Alice' }, updatedAt: 123456 })

        disable()
    })
})

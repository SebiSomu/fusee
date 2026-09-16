import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { setupDom, cleanupDom } from './comet-helpers/setup.js'
import { startTestServer } from './comet-helpers/test-server.js'

let comet
let testServer

function waitForEvent(el, name) {
    return new Promise(resolve => {
        el.addEventListener(`comet:${name}`, resolve, { once: true })
    })
}

beforeAll(async () => {
    setupDom()
    comet = await import('../core/comet-js/comet.js')
    testServer = await startTestServer({
        'GET /greeting': (req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<span id="msg">hello</span>')
        },
        'POST /submit': (req, res, body) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(`<span id="msg">got:${body}</span>`)
        },
        'GET /fail': (req, res) => {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('server error')
        },
        'GET /slow': (req, res) => {
            setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<span>slow-done</span>')
            }, 60)
        },
        'GET /oob': (req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(
                '<div>main content</div>' +
                '<div id="sidebar" comet-swap-oob="true">oob content</div>'
            )
        },
        'GET /redirecting': (req, res) => {
            res.writeHead(200, { 'Comet-Redirect': '/somewhere-else' })
            res.end('')
        },
        'GET /retargeting': (req, res) => {
            res.writeHead(200, { 'Comet-Retarget': '#alt-target', 'Content-Type': 'text/html' })
            res.end('<span>retargeted</span>')
        },
        'GET /reswapping': (req, res) => {
            res.writeHead(200, { 'Comet-Reswap': 'outerHTML', 'Content-Type': 'text/html' })
            res.end('<div id="replaced">reswapped</div>')
        },
        'GET /pushing': (req, res) => {
            res.writeHead(200, { 'Comet-Push-Url': '/new-url', 'Content-Type': 'text/html' })
            res.end('<span>pushed</span>')
        },
    })
})

afterAll(async () => {
    await testServer.close()
})

beforeEach(() => {
    cleanupDom()
})

// --- Pure function tests ---------------------------------------------

describe('parseTriggerSpec', () => {
    it('parses a bare event name', () => {
        expect(comet.parseTriggerSpec('click')).toEqual([
            { event: 'click', once: false, changed: false, delay: 0, throttle: 0, from: null },
        ])
    })

    it('parses modifiers: changed, delay, throttle, once, from', () => {
        const [spec] = comet.parseTriggerSpec('keyup changed delay:500ms once from:#other')
        expect(spec.event).toBe('keyup')
        expect(spec.changed).toBe(true)
        expect(spec.delay).toBe(500)
        expect(spec.once).toBe(true)
        expect(spec.from).toBe('#other')
    })

    it('parses "every Xs" as a poll spec', () => {
        expect(comet.parseTriggerSpec('every 2s')).toEqual([{ poll: 2000 }])
    })

    it('parses "every Xms"', () => {
        expect(comet.parseTriggerSpec('every 500ms')).toEqual([{ poll: 500 }])
    })

    it('parses multiple comma-separated triggers', () => {
        const specs = comet.parseTriggerSpec('click, keyup delay:200ms')
        expect(specs).toHaveLength(2)
        expect(specs[0].event).toBe('click')
        expect(specs[1].event).toBe('keyup')
        expect(specs[1].delay).toBe(200)
    })

    it('returns a null-event placeholder for an empty spec (resolved later by tag default)', () => {
        expect(comet.parseTriggerSpec('')).toEqual([{ event: null }])
    })
})

describe('getRequestConfig', () => {
    it('reads comet-get', () => {
        document.body.innerHTML = '<button comet-get="/x"></button>'
        const el = document.querySelector('button')
        expect(comet.getRequestConfig(el)).toEqual({ method: 'get', url: '/x' })
    })

    it('reads comet-post', () => {
        document.body.innerHTML = '<button comet-post="/y"></button>'
        const el = document.querySelector('button')
        expect(comet.getRequestConfig(el)).toEqual({ method: 'post', url: '/y' })
    })

    it('returns null when no method attribute is present', () => {
        document.body.innerHTML = '<button></button>'
        expect(comet.getRequestConfig(document.querySelector('button'))).toBeNull()
    })
})

describe('gatherParams', () => {
    it('gathers form field values from a form element', () => {
        document.body.innerHTML = '<form><input name="q" value="hello"><input name="n" value="5"></form>'
        const params = comet.gatherParams(document.querySelector('form'))
        expect(params.get('q')).toBe('hello')
        expect(params.get('n')).toBe('5')
    })

    it('gathers comet-vals as JSON', () => {
        document.body.innerHTML = `<button comet-vals='{"a":"1","b":"2"}'></button>`
        const params = comet.gatherParams(document.querySelector('button'))
        expect(params.get('a')).toBe('1')
        expect(params.get('b')).toBe('2')
    })

    it('gathers values from comet-include selector', () => {
        document.body.innerHTML = `
            <input id="extra" name="extra" value="included">
            <button comet-include="#extra"></button>
        `
        const params = comet.gatherParams(document.querySelector('button'))
        expect(params.get('extra')).toBe('included')
    })

    it("gathers the triggering element's own name/value if not a form", () => {
        document.body.innerHTML = '<input name="solo" value="v1">'
        const params = comet.gatherParams(document.querySelector('input'))
        expect(params.get('solo')).toBe('v1')
    })
})

describe('swap', () => {
    it('innerHTML replaces target contents', () => {
        document.body.innerHTML = '<div id="t">old</div>'
        const t = document.getElementById('t')
        comet.swap(t, '<span>new</span>', 'innerHTML')
        expect(t.innerHTML).toBe('<span>new</span>')
    })

    it('outerHTML replaces the target element itself', () => {
        document.body.innerHTML = '<div id="t">old</div>'
        const t = document.getElementById('t')
        comet.swap(t, '<span id="new">new</span>', 'outerHTML')
        expect(document.getElementById('t')).toBeNull()
        expect(document.getElementById('new')).not.toBeNull()
    })

    it('beforeend appends inside the target', () => {
        document.body.innerHTML = '<div id="t"><p>existing</p></div>'
        const t = document.getElementById('t')
        comet.swap(t, '<p>added</p>', 'beforeend')
        expect(t.children.length).toBe(2)
        expect(t.children[1].textContent).toBe('added')
    })

    it('afterend inserts as the next sibling', () => {
        document.body.innerHTML = '<div id="t"></div>'
        const t = document.getElementById('t')
        comet.swap(t, '<span id="sib"></span>', 'afterend')
        expect(t.nextElementSibling.id).toBe('sib')
    })

    it('delete removes the target and ignores the html', () => {
        document.body.innerHTML = '<div id="t"></div>'
        const t = document.getElementById('t')
        comet.swap(t, '<span>ignored</span>', 'delete')
        expect(document.getElementById('t')).toBeNull()
    })

    it('none does not touch the DOM', () => {
        document.body.innerHTML = '<div id="t">unchanged</div>'
        const t = document.getElementById('t')
        comet.swap(t, '<span>ignored</span>', 'none')
        expect(t.innerHTML).toBe('unchanged')
    })
})

describe('extractOOBSwaps', () => {
    it('extracts a comet-swap-oob="true" element, defaulting to outerHTML by its own id', () => {
        const html = '<div>main</div><div id="side" comet-swap-oob="true">side content</div>'
        const { mainHTML, oobSwaps } = comet.extractOOBSwaps(html, document)
        expect(mainHTML).not.toContain('side content')
        expect(oobSwaps).toHaveLength(1)
        expect(oobSwaps[0].mode).toBe('outerHTML')
        expect(oobSwaps[0].targetSelector).toBe('#side')
    })

    it('extracts an explicit mode:selector form', () => {
        const html = '<div id="x" comet-swap-oob="innerHTML:#custom-target">content</div>'
        const { oobSwaps } = comet.extractOOBSwaps(html, document)
        expect(oobSwaps[0].mode).toBe('innerHTML')
        expect(oobSwaps[0].targetSelector).toBe('#custom-target')
    })

    it('leaves html with no oob markers untouched', () => {
        const html = '<div>plain</div>'
        const { mainHTML, oobSwaps } = comet.extractOOBSwaps(html, document)
        expect(mainHTML).toBe(html)
        expect(oobSwaps).toHaveLength(0)
    })
})

// --- End-to-end: real server, real DOM ---------------------------------

describe('performRequest — end to end against a real server', () => {
    it('GET request swaps the response HTML into the target', async () => {
        document.body.innerHTML = `
            <button comet-get="${testServer.url}/greeting" comet-target="#out"></button>
            <div id="out"></div>
        `
        const btn = document.querySelector('button')
        await comet.performRequest(btn, null)
        expect(document.getElementById('out').innerHTML).toBe('<span id="msg">hello</span>')
    })

    it('POST request sends form-encoded params and the body reaches the server', async () => {
        document.body.innerHTML = `
            <form comet-post="${testServer.url}/submit" comet-target="#out">
                <input name="field" value="myvalue">
            </form>
            <div id="out"></div>
        `
        const form = document.querySelector('form')
        await comet.performRequest(form, null)
        expect(document.getElementById('out').innerHTML).toContain('field=myvalue')
    })

    it('a non-2xx response fires comet:responseError and does not swap', async () => {
        document.body.innerHTML = `
            <button comet-get="${testServer.url}/fail" comet-target="#out"></button>
            <div id="out">untouched</div>
        `
        const btn = document.querySelector('button')
        const errPromise = waitForEvent(btn, 'responseError')
        await comet.performRequest(btn, null)
        const errEvent = await errPromise
        expect(errEvent.detail.response.status).toBe(500)
        expect(document.getElementById('out').innerHTML).toBe('untouched')
    })
})

describe('out-of-band swaps — end to end', () => {
    it('swaps the OOB fragment into its own target, separate from the main swap', async () => {
        document.body.innerHTML = `
            <button comet-get="${testServer.url}/oob" comet-target="#main"></button>
            <div id="main"></div>
            <div id="sidebar">old sidebar</div>
        `
        const btn = document.querySelector('button')
        await comet.performRequest(btn, null)
        expect(document.getElementById('main').innerHTML).toContain('main content')
        expect(document.getElementById('main').innerHTML).not.toContain('oob content')
        expect(document.getElementById('sidebar').innerHTML).toBe('oob content')
    })
})

describe('response headers — Retarget, Reswap, Push-Url', () => {
    it('Comet-Retarget redirects the swap to a different element', async () => {
        document.body.innerHTML = `
            <button comet-get="${testServer.url}/retargeting" comet-target="#original"></button>
            <div id="original">untouched</div>
            <div id="alt-target"></div>
        `
        const btn = document.querySelector('button')
        await comet.performRequest(btn, null)
        expect(document.getElementById('original').innerHTML).toBe('untouched')
        expect(document.getElementById('alt-target').innerHTML).toBe('<span>retargeted</span>')
    })

    it('Comet-Reswap overrides the swap mode', async () => {
        document.body.innerHTML = `
            <button comet-get="${testServer.url}/reswapping" comet-target="#replace-me" comet-swap="innerHTML"></button>
            <div id="replace-me">old</div>
        `
        const btn = document.querySelector('button')
        await comet.performRequest(btn, null)
        expect(document.getElementById('replace-me')).toBeNull()
        expect(document.getElementById('replaced').textContent).toBe('reswapped')
    })

    it('Comet-Push-Url pushes history state', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/pushing" comet-target="#out"></button><div id="out"></div>`
        const btn = document.querySelector('button')
        const pushSpy = vi.spyOn(window.history, 'pushState')
        await comet.performRequest(btn, null)
        expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ comet: true }), '', '/new-url')
        pushSpy.mockRestore()
    })

    it('comet-push-url attribute pushes when the server does not override it', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out" comet-push-url="/attr-pushed"></button><div id="out"></div>`
        const btn = document.querySelector('button')
        const pushSpy = vi.spyOn(window.history, 'pushState')
        await comet.performRequest(btn, null)
        expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({ comet: true }), '', '/attr-pushed')
        pushSpy.mockRestore()
    })
})

// --- Lifecycle events -----------------------------------------------------

describe('lifecycle events', () => {
    it('preventDefault on comet:configRequest cancels the request entirely', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out"></button><div id="out">untouched</div>`
        const btn = document.querySelector('button')
        btn.addEventListener('comet:configRequest', e => e.preventDefault())
        await comet.performRequest(btn, null)
        expect(document.getElementById('out').innerHTML).toBe('untouched')
    })

    it('preventDefault on comet:beforeRequest cancels the request', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out"></button><div id="out">untouched</div>`
        const btn = document.querySelector('button')
        btn.addEventListener('comet:beforeRequest', e => e.preventDefault())
        await comet.performRequest(btn, null)
        expect(document.getElementById('out').innerHTML).toBe('untouched')
    })

    it('preventDefault on comet:beforeSwap prevents the swap but the request still happened', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out"></button><div id="out">untouched</div>`
        const btn = document.querySelector('button')
        const afterReq = waitForEvent(btn, 'afterRequest')
        btn.addEventListener('comet:beforeSwap', e => e.preventDefault())
        await comet.performRequest(btn, null)
        await afterReq
        expect(document.getElementById('out').innerHTML).toBe('untouched')
    })

    it('fires afterSwap after a successful swap', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out"></button><div id="out"></div>`
        const btn = document.querySelector('button')
        const afterSwap = waitForEvent(btn, 'afterSwap')
        await comet.performRequest(btn, null)
        await afterSwap
        expect(document.getElementById('out').innerHTML).toContain('hello')
    })
})

// --- Indicator + confirm --------------------------------------------------

describe('comet-indicator', () => {
    it('adds the requesting class during the request and removes it after', async () => {
        document.body.innerHTML = `
            <button comet-get="${testServer.url}/slow" comet-target="#out" comet-indicator="#spinner"></button>
            <div id="spinner"></div>
            <div id="out"></div>
        `
        const btn = document.querySelector('button')
        const spinner = document.getElementById('spinner')

        const promise = comet.performRequest(btn, null)
        // The request is in flight (server delays 60ms) — indicator should be on now.
        await new Promise(r => setTimeout(r, 10))
        expect(spinner.classList.contains('comet-requesting')).toBe(true)

        await promise
        expect(spinner.classList.contains('comet-requesting')).toBe(false)
    })
})

describe('comet-confirm', () => {
    it('does not send the request if confirm() returns false', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out" comet-confirm="Sure?"></button><div id="out">untouched</div>`
        const btn = document.querySelector('button')
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        await comet.performRequest(btn, null)
        expect(document.getElementById('out').innerHTML).toBe('untouched')
        confirmSpy.mockRestore()
    })

    it('sends the request if confirm() returns true', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out" comet-confirm="Sure?"></button><div id="out"></div>`
        const btn = document.querySelector('button')
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
        await comet.performRequest(btn, null)
        expect(document.getElementById('out').innerHTML).toContain('hello')
        confirmSpy.mockRestore()
    })
})

// --- Wiring: real event dispatch, not direct performRequest calls -------

describe('wireElement + process — real trigger events', () => {
    it('default trigger for a button is click', async () => {
        document.body.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out"></button><div id="out"></div>`
        const btn = document.querySelector('button')
        comet.process(document.body)

        const afterSwap = waitForEvent(btn, 'afterSwap')
        btn.click()
        await afterSwap
        expect(document.getElementById('out').innerHTML).toContain('hello')
    })

    it('default trigger for a form is submit, and default navigation is prevented', async () => {
        document.body.innerHTML = `
            <form comet-get="${testServer.url}/greeting" comet-target="#out"></form>
            <div id="out"></div>
        `
        const form = document.querySelector('form')
        comet.process(document.body)

        const afterSwap = waitForEvent(form, 'afterSwap')
        const submitEvent = new window.Event('submit', { cancelable: true })
        form.dispatchEvent(submitEvent)
        await afterSwap
        expect(submitEvent.defaultPrevented).toBe(true)
        expect(document.getElementById('out').innerHTML).toContain('hello')
    })

    it('"once" modifier only fires the request on the first trigger', async () => {
        let hitCount = 0
        const server2 = await startTestServer({
            'GET /count': (req, res) => {
                hitCount++
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<span>counted</span>')
            },
        })

        document.body.innerHTML = `<button comet-get="${server2.url}/count" comet-target="#out" comet-trigger="click once"></button><div id="out"></div>`
        const btn = document.querySelector('button')
        comet.process(document.body)

        const first = waitForEvent(btn, 'afterSwap')
        btn.click()
        await first
        btn.click()
        btn.click()
        await new Promise(r => setTimeout(r, 30))

        expect(hitCount).toBe(1)
        await server2.close()
    })

    it('"changed" modifier skips firing when the value has not actually changed', async () => {
        let hitCount = 0
        const server3 = await startTestServer({
            'GET /onchange': (req, res) => {
                hitCount++
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<span>ok</span>')
            },
        })

        document.body.innerHTML = `
            <input comet-get="${server3.url}/onchange" comet-target="#out" comet-trigger="keyup changed" value="abc">
            <div id="out"></div>
        `
        const input = document.querySelector('input')
        comet.process(document.body)

        // Same value as initial -> should NOT fire.
        input.dispatchEvent(new window.Event('keyup'))
        await new Promise(r => setTimeout(r, 20))
        expect(hitCount).toBe(0)

        // Actually change the value -> should fire.
        input.value = 'xyz'
        const afterSwap = waitForEvent(input, 'afterSwap')
        input.dispatchEvent(new window.Event('keyup'))
        await afterSwap
        expect(hitCount).toBe(1)

        await server3.close()
    })

    it('"delay" modifier debounces rapid triggers into a single request', async () => {
        let hitCount = 0
        const server4 = await startTestServer({
            'GET /debounced': (req, res) => {
                hitCount++
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<span>ok</span>')
            },
        })

        document.body.innerHTML = `<input comet-get="${server4.url}/debounced" comet-target="#out" comet-trigger="keyup delay:30ms"><div id="out"></div>`
        const input = document.querySelector('input')
        comet.process(document.body)

        const afterReq = waitForEvent(input, 'afterRequest')
        input.dispatchEvent(new window.Event('keyup'))
        input.dispatchEvent(new window.Event('keyup'))
        input.dispatchEvent(new window.Event('keyup'))

        await afterReq
        expect(hitCount).toBe(1)

        await server4.close()
    })

    it('"every Xs" polls repeatedly and stops once the element is removed from the DOM', async () => {
        let hitCount = 0
        const server5 = await startTestServer({
            'GET /poll': (req, res) => {
                hitCount++
                res.writeHead(200, { 'Content-Type': 'text/html' })
                res.end('<span>polled</span>')
            },
        })

        document.body.innerHTML = `<div id="poller" comet-get="${server5.url}/poll" comet-target="#out" comet-trigger="every 20ms"></div><div id="out"></div>`
        comet.process(document.body)

        await new Promise(r => setTimeout(r, 120))
        expect(hitCount).toBeGreaterThanOrEqual(2)

        document.getElementById('poller').remove()
        await new Promise(r => setTimeout(r, 40))
        const countAtRemoval = hitCount
        await new Promise(r => setTimeout(r, 80))
        expect(hitCount).toBe(countAtRemoval)

        await server5.close()
    })

    it('MutationObserver auto-wires elements added to the DOM after init()', async () => {
        document.body.innerHTML = '<div id="container"></div>'
        comet.init(document.body)

        const container = document.getElementById('container')
        container.innerHTML = `<button comet-get="${testServer.url}/greeting" comet-target="#out"></button><div id="out"></div>`

        // MutationObserver callbacks run as a microtask after the DOM
        // mutation — give it a tick before interacting with the new element.
        await new Promise(r => setTimeout(r, 0))

        const btn = container.querySelector('button')
        const afterSwap = waitForEvent(btn, 'afterSwap')
        btn.click()
        await afterSwap
        expect(document.getElementById('out').innerHTML).toContain('hello')

        comet.stopObserving()
    })
})
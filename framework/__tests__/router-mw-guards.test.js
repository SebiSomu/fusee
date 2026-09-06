// router.test.js
//
// Vitest suite for the guard + middleware pipeline added to router.js.
// Place this next to router.js (e.g. src/router/__tests__/router.test.js)
// and adjust the relative import path below if your layout differs.
//
// Requires: vitest, jsdom (npm i -D vitest jsdom) and a vitest config with
// `test: { environment: 'jsdom' }` — see vitest.config.js in this delivery.
//
// The module is re-imported fresh (via vi.resetModules + dynamic import) in
// every test because router.js keeps its state (routes, guards, middleware,
// signals) at module scope. That's the right design for the framework itself
// (one router per app), but it means tests need a clean module graph each
// time rather than relying on any exported "reset" call.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

let currentRouter = null
let root = null

function makeComponent(label) {
    return function factory() {
        return {
            render(container) { container.textContent = label },
            unmount() { }
        }
    }
}

async function flushUntil(check, { timeout = 500 } = {}) {
    await vi.waitFor(() => {
        if (!check()) throw new Error('condition not met yet')
    }, { timeout, interval: 5 })
}

async function setupRouter(routes, { initialPath = '/' } = {}) {
    vi.resetModules()
    window.history.replaceState({}, '', initialPath)

    const mod = await import('../router/router.js')

    root = document.createElement('div')
    document.body.appendChild(root)

    currentRouter = mod.createRouter(routes)
    mod.mountOutlet(root)

    return mod
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => { })
    vi.spyOn(console, 'warn').mockImplementation(() => { })
})

afterEach(() => {
    if (currentRouter) {
        currentRouter.destroy()
        currentRouter = null
    }
    document.body.innerHTML = ''
    root = null
    vi.restoreAllMocks()
})

describe('basic navigation (sanity check before guards/middleware)', () => {
    it('renders the route matching the initial URL on mount', async () => {
        const mod = await setupRouter([
            { path: '/', component: makeComponent('home') },
            { path: '/about', component: makeComponent('about') }
        ])

        await flushUntil(() => root.textContent === 'home')
        expect(window.location.pathname).toBe('/')
    })

    it('navigate() renders the target route and pushes history', async () => {
        const mod = await setupRouter([
            { path: '/', component: makeComponent('home') },
            { path: '/about', component: makeComponent('about') }
        ])
        await flushUntil(() => root.textContent === 'home')

        await mod.navigate('/about')

        expect(root.textContent).toBe('about')
        expect(window.location.pathname).toBe('/about')
    })
})

describe('navigation guards', () => {
    const routes = () => [
        { path: '/', component: makeComponent('home') },
        { path: '/about', component: makeComponent('about') },
        { path: '/login', component: makeComponent('login') },
        {
            path: '/admin',
            component: makeComponent('admin'),
            beforeEnter: ({ path }) => path === '/admin' ? '/login' : true
        }
    ]

    it('a beforeEach guard returning false cancels navigate() before history changes', async () => {
        const mod = await setupRouter(routes())
        await flushUntil(() => root.textContent === 'home')

        mod.beforeEach((to) => {
            if (to.path === '/about') return false
        })

        await mod.navigate('/about')

        expect(root.textContent).toBe('home')
        expect(window.location.pathname).toBe('/')
    })

    it('a beforeEach guard returning a string redirects, and the redirect target is what commits', async () => {
        const mod = await setupRouter(routes())
        await flushUntil(() => root.textContent === 'home')

        mod.beforeEach((to) => {
            if (to.path === '/about') return '/login'
        })

        await mod.navigate('/about')

        expect(root.textContent).toBe('login')
        expect(window.location.pathname).toBe('/login')
    })

    it('a beforeEnter guard on the route itself can redirect (e.g. an auth wall)', async () => {
        const mod = await setupRouter(routes())
        await flushUntil(() => root.textContent === 'home')

        await mod.navigate('/admin')

        expect(root.textContent).toBe('login')
        expect(window.location.pathname).toBe('/login')
    })

    it('global beforeEach guards run before per-route beforeEnter guards', async () => {
        const calls = []
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            {
                path: '/dashboard',
                component: makeComponent('dashboard'),
                beforeEnter: () => { calls.push('route') }
            }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        mod.beforeEach(() => { calls.push('global') })

        await mod.navigate('/dashboard')

        expect(calls).toEqual(['global', 'route'])
        expect(root.textContent).toBe('dashboard')
    })

    it('guards may be async (return a Promise)', async () => {
        const mod = await setupRouter(routes())
        await flushUntil(() => root.textContent === 'home')

        mod.beforeEach(async (to) => {
            await new Promise(r => setTimeout(r, 10))
            return to.path !== '/about'
        })

        await mod.navigate('/about')

        expect(root.textContent).toBe('home')
        expect(window.location.pathname).toBe('/')
    })

    it('afterEach receives the committed to/from locations', async () => {
        const mod = await setupRouter(routes())
        await flushUntil(() => root.textContent === 'home')

        const hook = vi.fn()
        mod.afterEach(hook)

        await mod.navigate('/about')

        expect(hook).toHaveBeenCalledTimes(1)
        const [to, from] = hook.mock.calls[0]
        expect(to.path).toBe('/about')
        expect(from.path).toBe('/')
    })

    it('caps runaway guard redirects instead of looping forever', async () => {
        const loopRoutes = [
            { path: '/', component: makeComponent('home') },
            { path: '/loop', component: makeComponent('loop'), beforeEnter: () => '/loop2' },
            { path: '/loop2', component: makeComponent('loop2'), beforeEnter: () => '/loop' }
        ]
        const mod = await setupRouter(loopRoutes)
        await flushUntil(() => root.textContent === 'home')

        await mod.navigate('/loop')

        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('redirect loop')
        )
    })
})

describe('middleware pipeline', () => {
    it('global middleware runs, and data it attaches to ctx.meta lands in routeMeta()', async () => {
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            { path: '/profile', component: makeComponent('profile') }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        mod.use(async (ctx, next) => {
            ctx.meta.user = { id: 1 }
            await next()
        })

        await mod.navigate('/profile')

        expect(root.textContent).toBe('profile')
        expect(mod.routeMeta()).toEqual({ user: { id: 1 } })
    })

    it('runs global middleware before per-route middleware, in order', async () => {
        const calls = []
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            {
                path: '/profile',
                component: makeComponent('profile'),
                middleware: async (ctx, next) => { calls.push('route-mw'); await next() }
            }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        mod.use(async (ctx, next) => { calls.push('global-mw'); await next() })

        await mod.navigate('/profile')

        expect(calls).toEqual(['global-mw', 'route-mw'])
    })

    it('runs only after guards have allowed the navigation', async () => {
        const calls = []
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            {
                path: '/profile',
                component: makeComponent('profile'),
                beforeEnter: () => { calls.push('guard') },
                middleware: async (ctx, next) => { calls.push('middleware'); await next() }
            }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        await mod.navigate('/profile')

        expect(calls).toEqual(['guard', 'middleware'])
    })

    it('supports onion-style ordering: code after await next() runs on the way back out', async () => {
        const calls = []
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            { path: '/profile', component: makeComponent('profile') }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        mod.use(async (ctx, next) => {
            calls.push('outer-before')
            await next()
            calls.push('outer-after')
        })
        mod.use(async (ctx, next) => {
            calls.push('inner-before')
            await next()
            calls.push('inner-after')
        })

        await mod.navigate('/profile')

        expect(calls).toEqual(['outer-before', 'inner-before', 'inner-after', 'outer-after'])
    })

    it('a middleware that never calls next() halts navigation entirely', async () => {
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            { path: '/blocked', component: makeComponent('blocked') }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        mod.use(() => {
            // intentionally never calls next(); e.g. a middleware that
            // redirected the user elsewhere itself and is done here.
        })

        await mod.navigate('/blocked')

        expect(root.textContent).toBe('home')
        expect(window.location.pathname).toBe('/')
    })

    it('a thrown middleware error goes to onError and aborts the navigation', async () => {
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            { path: '/broken', component: makeComponent('broken') }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        const errorHandler = vi.fn()
        mod.onError(errorHandler)
        mod.use(() => {
            throw new Error('boom')
        })

        await mod.navigate('/broken')

        expect(root.textContent).toBe('home')
        expect(window.location.pathname).toBe('/')
        expect(errorHandler).toHaveBeenCalledTimes(1)
        expect(errorHandler.mock.calls[0][0].message).toBe('boom')
    })
})

describe('guards on back/forward (popstate)', () => {
    it('reverts the address bar when a guard cancels a back-navigation', async () => {
        const localRoutes = [
            { path: '/', component: makeComponent('home') },
            { path: '/two', component: makeComponent('two') }
        ]
        const mod = await setupRouter(localRoutes)
        await flushUntil(() => root.textContent === 'home')

        await mod.navigate('/two')
        expect(root.textContent).toBe('two')

        mod.beforeEach((to) => {
            if (to.path === '/') return false
        })

        window.history.back()

        await flushUntil(() => window.location.pathname === '/two')
        expect(root.textContent).toBe('two')
    })
})
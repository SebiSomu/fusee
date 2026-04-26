import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter, mountOutlet, routeQuery, currentRoute } from '../router/router.js'

let currentRouter = null

beforeEach(() => {
    Object.defineProperty(window, 'location', {
        writable: true,
        value: { pathname: '/', search: '', hash: '' }
    })

    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) existingOutlet.remove()
    
    currentRouter = null
})

afterEach(() => {
    if (currentRouter) {
        currentRouter.destroy()
        currentRouter = null
    }
    
    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) existingOutlet.remove()
    
    routeQuery({})
    currentRoute('/')
})

function createMockComponent(renderFn) {
    return () => ({
        render: renderFn,
        unmount: () => { }
    })
}

describe('Router Query Parameters', () => {
    it('extracts query parameters from initial URL', () => {
        const routes = [
            {
                path: '/',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Home'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/', search: '?q=test&page=1', hash: '' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        mountOutlet(outlet)

        expect(routeQuery()).toEqual({ q: 'test', page: '1' })
    })

    it('updates routeQuery when navigating', () => {
        const routes = [
            {
                path: '/',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Home'
                })
            },
            {
                path: '/search',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Search Results'
                })
            }
        ]

        const pushStateSpy = vi.fn((state, title, url) => {
            if (typeof url === 'string') {
                const [path, search] = url.split('?')
                window.location.pathname = path
                window.location.search = search ? '?' + search : ''
            }
        })
        Object.defineProperty(window.history, 'pushState', {
            writable: true,
            value: pushStateSpy
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        mountOutlet(outlet)

        expect(routeQuery()).toEqual({})

        currentRouter.navigate('/search?q=fusee&sort=desc')

        expect(window.location.pathname).toBe('/search')
        expect(window.location.search).toBe('?q=fusee&sort=desc')
        expect(routeQuery()).toEqual({ q: 'fusee', sort: 'desc' })
    })

    it('ignores query parameters when matching routes', () => {
        const routes = [
            {
                path: '/products',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Products Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/products', search: '?category=electronics', hash: '' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        mountOutlet(outlet)

        expect(outlet.innerHTML).toBe('Products Page')
        expect(routeQuery()).toEqual({ category: 'electronics' })
    })

    it('works with complex query strings and hashes', () => {
        const routes = [
            {
                path: '/test',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Test'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/test', search: '?a=1&b=2&c=3', hash: '#section1' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        mountOutlet(outlet)

        expect(outlet.innerHTML).toBe('Test')
        expect(routeQuery()).toEqual({ a: '1', b: '2', c: '3' })
    })
})

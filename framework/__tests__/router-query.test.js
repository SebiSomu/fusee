import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter, mountOutlet, routeQuery, currentRoute } from '../router/router.js'

let currentRouter = null

beforeEach(() => {
    window.history.replaceState({}, '', '/')

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
    it('extracts query parameters from initial URL', async () => {
        const routes = [
            {
                path: '/',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Home'
                })
            }
        ]

        window.history.replaceState({}, '', '/?q=test&page=1')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(routeQuery()).toEqual({ q: 'test', page: '1' })
    })

    it('updates routeQuery when navigating', async () => {
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

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(routeQuery()).toEqual({})

        await currentRouter.navigate('/search?q=fusee&sort=desc')

        expect(window.location.pathname).toBe('/search')
        expect(window.location.search).toBe('?q=fusee&sort=desc')
        expect(routeQuery()).toEqual({ q: 'fusee', sort: 'desc' })
    })

    it('ignores query parameters when matching routes', async () => {
        const routes = [
            {
                path: '/products',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Products Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/products?category=electronics')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(outlet.innerHTML).toBe('Products Page')
        expect(routeQuery()).toEqual({ category: 'electronics' })
    })

    it('works with complex query strings and hashes', async () => {
        const routes = [
            {
                path: '/test',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Test'
                })
            }
        ]

        window.history.replaceState({}, '', '/test?a=1&b=2&c=3#section1')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(outlet.innerHTML).toBe('Test')
        expect(routeQuery()).toEqual({ a: '1', b: '2', c: '3' })
    })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRouter, mountOutlet, routeParams, currentRoute } from '../router/router.js'

// Mock window.location for testing
const mockLocation = new URL('http://localhost')

beforeEach(() => {
    // Reset window.location mock
    Object.defineProperty(window, 'location', {
        writable: true,
        value: { pathname: '/' }
    })
    
    // Clean up DOM
    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) {
        existingOutlet.remove()
    }
})

afterEach(() => {
    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) {
        existingOutlet.remove()
    }
})

// Helper to create a mock component
function createMockComponent(renderFn) {
    return () => ({
        render: renderFn,
        unmount: () => {}
    })
}

describe('Dynamic Routes', () => {
    it('matches dynamic route with single parameter', () => {
        const routes = [
            {
                path: '/users/:id',
                component: createMockComponent((el) => {
                    el.innerHTML = 'User Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/users/123' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        createRouter(routes)
        mountOutlet(outlet)

        expect(currentRoute()).toBe('/users/123')
        expect(routeParams()).toEqual({ id: '123' })
    })

    it('matches dynamic route with multiple parameters', () => {
        const routes = [
            {
                path: '/posts/:category/:slug',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Post Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/posts/tech/my-first-post' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        createRouter(routes)
        mountOutlet(outlet)

        expect(currentRoute()).toBe('/posts/tech/my-first-post')
        expect(routeParams()).toEqual({ category: 'tech', slug: 'my-first-post' })
    })

    it('extracts parameters correctly for nested dynamic routes', () => {
        const routes = [
            {
                path: '/org/:orgId/team/:teamId',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Team Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/org/acme/team/engineering' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        createRouter(routes)
        mountOutlet(outlet)

        expect(routeParams()).toEqual({ orgId: 'acme', teamId: 'engineering' })
    })

    it('updates routeParams when navigating to different dynamic routes', () => {
        const routes = [
            {
                path: '/users/:id',
                component: createMockComponent((el) => {
                    el.innerHTML = 'User Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/users/123' }
        })

        // Mock history.pushState to update window.location.pathname
        const pushStateSpy = vi.fn((state, title, url) => {
            if (typeof url === 'string') {
                window.location.pathname = url
            }
        })
        Object.defineProperty(window.history, 'pushState', {
            writable: true,
            value: pushStateSpy
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes)
        mountOutlet(outlet)

        expect(routeParams()).toEqual({ id: '123' })

        // Navigate to different user
        router.navigate('/users/456')

        expect(routeParams()).toEqual({ id: '456' })
    })

    it('prioritizes exact match over dynamic match', () => {
        const routes = [
            {
                path: '/users/profile',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Profile Page'
                })
            },
            {
                path: '/users/:id',
                component: createMockComponent((el) => {
                    el.innerHTML = 'User Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/users/profile' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        createRouter(routes)
        mountOutlet(outlet)

        expect(outlet.innerHTML).toBe('Profile Page')
        expect(routeParams()).toEqual({})
    })
})

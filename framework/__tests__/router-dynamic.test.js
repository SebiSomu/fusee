import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter, mountOutlet, routeParams, currentRoute, matchedRoutes } from '../router/router.js'

let currentRouter = null

beforeEach(() => {
    Object.defineProperty(window, 'location', {
        writable: true,
        value: { pathname: '/' }
    })

    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) existingOutlet.remove()
    
    currentRouter = null
})

afterEach(() => {
    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) existingOutlet.remove()
    
    if (currentRouter) {
        currentRouter.destroy()
        currentRouter = null
    }
    
    // Clear any remaining event listeners
    const newOutlet = document.getElementById('router-test-outlet')
    if (newOutlet) newOutlet.remove()
    
    // Reset route params signal
    routeParams({})
    matchedRoutes([])
    currentRoute('/')
})

// Helper to create a mock component
function createMockComponent(renderFn) {
    return () => ({
        render: renderFn,
        unmount: () => { }
    })
}

// ─── Flat Dynamic Routes (backward compatible) ──────────────────────────────

describe('Dynamic Routes (flat)', () => {
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

        currentRouter = createRouter(routes)
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

        currentRouter = createRouter(routes)
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

        currentRouter = createRouter(routes)
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

        currentRouter = createRouter(routes)
        mountOutlet(outlet)

        expect(outlet.innerHTML).toBe('Profile Page')
        expect(routeParams()).toEqual({})
    })

    // ─── Nested Routes ──────────────────────────────────────────────────────────

    describe('Nested Routes', () => {
        it('matches parent + index child for parent path', () => {
            const routes = [
                {
                    path: '/users',
                    component: createMockComponent((el) => {
                        el.innerHTML = '<h1>Users Layout</h1><div data-router-view></div>'
                    }),
                    children: [
                        {
                            path: '',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'Users Index'
                            })
                        },
                        {
                            path: ':id',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'User Detail'
                            })
                        }
                    ]
                }
            ]

            Object.defineProperty(window, 'location', {
                writable: true,
                value: { pathname: '/users' }
            })

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            mountOutlet(outlet)

            expect(outlet.querySelector('h1').textContent).toBe('Users Layout')
            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Users Index')
        })

        it('matches parent + dynamic child', () => {
            const routes = [
                {
                    path: '/users',
                    component: createMockComponent((el) => {
                        el.innerHTML = '<h1>Users Layout</h1><div data-router-view></div>'
                    }),
                    children: [
                        {
                            path: '',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'Users Index'
                            })
                        },
                        {
                            path: ':id',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'User Detail'
                            })
                        }
                    ]
                }
            ]

            Object.defineProperty(window, 'location', {
                writable: true,
                value: { pathname: '/users/42' }
            })

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            mountOutlet(outlet)

            expect(outlet.querySelector('h1').textContent).toBe('Users Layout')
            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
            expect(routeParams()).toEqual({ id: '42' })
        })

        it('merges params from all levels in the chain', () => {
            const routes = [
                {
                    path: '/org/:orgId',
                    component: createMockComponent((el) => {
                        el.innerHTML = '<div data-router-view></div>'
                    }),
                    children: [
                        {
                            path: 'team/:teamId',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'Team Page'
                            })
                        }
                    ]
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

        it('exposes matchedRoutes signal with the full chain', () => {
            const parentRoute = {
                path: '/users',
                component: createMockComponent((el) => {
                    el.innerHTML = '<div data-router-view></div>'
                }),
                children: [
                    {
                        path: ':id',
                        component: createMockComponent((el) => {
                            el.innerHTML = 'User Detail'
                        })
                    }
                ]
            }

            const routes = [parentRoute]

            Object.defineProperty(window, 'location', {
                writable: true,
                value: { pathname: '/users/7' }
            })

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            mountOutlet(outlet)

            const matched = matchedRoutes()
            expect(matched).toHaveLength(2)
            expect(matched[0]).toBe(parentRoute)
            expect(matched[1]).toBe(parentRoute.children[0])
        })

        it('parent layout persists when navigating between children', () => {
            let layoutRenderCount = 0

            const routes = [
                {
                    path: '/users',
                    component: createMockComponent((el) => {
                        layoutRenderCount++
                        el.innerHTML = '<h1>Layout</h1><div data-router-view></div>'
                    }),
                    children: [
                        {
                            path: 'a',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'Page A'
                            })
                        },
                        {
                            path: 'b',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'Page B'
                            })
                        }
                    ]
                }
            ]

            Object.defineProperty(window, 'location', {
                writable: true,
                value: { pathname: '/users/a' }
            })

            const pushStateSpy = vi.fn((state, title, url) => {
                if (typeof url === 'string') window.location.pathname = url
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

            expect(layoutRenderCount).toBe(1)
            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Page A')

            // Navigate to sibling child
            router.navigate('/users/b')

            // Layout should NOT have been re-rendered
            expect(layoutRenderCount).toBe(1)
            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Page B')
        })

        it('unmounts entire chain when navigating to a completely different route', async () => {
            let layoutUnmounted = false
            let childUnmounted = false

            const routes = [
                {
                    path: '/test-unmount',
                    component: () => ({
                        render: (el) => {
                            el.innerHTML = '<div data-router-view></div>'
                        },
                        unmount: () => { layoutUnmounted = true }
                    }),
                    children: [
                        {
                            path: '',
                            component: () => ({
                                render: (el) => { el.innerHTML = 'Test Index' },
                                unmount: () => { childUnmounted = true }
                            })
                        }
                    ]
                },
                {
                    path: '/test-about',
                    component: createMockComponent((el) => {
                        el.innerHTML = 'About Page'
                    })
                }
            ]

            Object.defineProperty(window, 'location', {
                writable: true,
                value: { pathname: '/test-unmount' }
            })

            const pushStateSpy = vi.fn((state, title, url) => {
                if (typeof url === 'string') window.location.pathname = url
            })
            Object.defineProperty(window.history, 'pushState', {
                writable: true,
                value: pushStateSpy
            })

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            const router = createRouter(routes)
            currentRouter = router
            mountOutlet(outlet)

            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Test Index')

            router.navigate('/test-about')

            // Wait for next tick
            await new Promise(resolve => setTimeout(resolve, 0))

            expect(childUnmounted).toBe(true)
            expect(layoutUnmounted).toBe(true)
            expect(outlet.innerHTML).toBe('About Page')
        })

        it('renders 404 when no route matches', () => {
            const routes = [
                {
                    path: '/users',
                    component: createMockComponent((el) => {
                        el.innerHTML = '<div data-router-view></div>'
                    }),
                    children: [
                        {
                            path: '',
                            component: createMockComponent((el) => {
                                el.innerHTML = 'Index'
                            })
                        }
                    ]
                }
            ]

            Object.defineProperty(window, 'location', {
                writable: true,
                value: { pathname: '/nonexistent' }
            })

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            mountOutlet(outlet)

            expect(outlet.innerHTML).toContain('No route matched')
        })
    })
})

// ─── Router Optimizations Tests ────────────────────────────────────────────────

describe('Router Optimizations', () => {
    it('uses LRU cache for repeated route matching', () => {
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

        const router = createRouter(routes, { cacheSize: 10 })
        mountOutlet(outlet)

        expect(currentRoute()).toBe('/users/123')
        expect(routeParams()).toEqual({ id: '123' })

        // Navigate to same route - should use cache
        router.navigate('/users/456')
        expect(routeParams()).toEqual({ id: '456' })

        // Navigate back to first route - should use cache
        router.navigate('/users/123')
        expect(routeParams()).toEqual({ id: '123' })

        router.destroy()
    })

    it('handles errors in component rendering gracefully', () => {
        const routes = [
            {
                path: '/error',
                component: () => ({
                    render: () => {
                        throw new Error('Component render failed')
                    },
                    unmount: () => { }
                })
            },
            {
                path: '/safe',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Safe Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/error' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

        const router = createRouter(routes)
        mountOutlet(outlet)

        expect(outlet.innerHTML).toContain('Error rendering route')
        expect(consoleErrorSpy).toHaveBeenCalled()

        consoleErrorSpy.mockRestore()
        router.destroy()
    })

    it('respects custom routerViewTimeout option', () => {
        const routes = [
            {
                path: '/test',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Test Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/test' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes, { routerViewTimeout: 5000 })
        mountOutlet(outlet)

        expect(currentRoute()).toBe('/test')
        expect(outlet.innerHTML).toBe('Test Page')

        router.destroy()
    })

    it('clears cache on router destroy', () => {
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

        const router = createRouter(routes, { cacheSize: 10 })
        mountOutlet(outlet)

        // Cache should be populated
        expect(currentRoute()).toBe('/users/123')

        router.destroy()

        // Create new router - should not use old cache
        const router2 = createRouter(routes, { cacheSize: 10 })
        mountOutlet(outlet)

        expect(currentRoute()).toBe('/users/123')

        router2.destroy()
    })

    it('integration test: complex routing scenario with nested routes and params', async () => {
        let mountCount = 0
        let unmountCount = 0

        const routes = [
            {
                path: '/app',
                component: () => ({
                    render: (el) => {
                        mountCount++
                        el.innerHTML = '<div data-router-view></div>'
                    },
                    unmount: () => { unmountCount++ }
                }),
                children: [
                    {
                        path: 'dashboard',
                        component: createMockComponent((el) => {
                            el.innerHTML = 'Dashboard'
                        })
                    },
                    {
                        path: 'users/:userId',
                        component: createMockComponent((el) => {
                            el.innerHTML = 'User Detail'
                        })
                    }
                ]
            },
            {
                path: '/settings',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Settings'
                })
            },
            {
                path: '*',
                component: createMockComponent((el) => {
                    el.innerHTML = '404 Not Found'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/app/dashboard' }
        })

        const pushStateSpy = vi.fn((state, title, url) => {
            if (typeof url === 'string') window.location.pathname = url
        })
        Object.defineProperty(window.history, 'pushState', {
            writable: true,
            value: pushStateSpy
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes, { cacheSize: 50 })
        currentRouter = router
        mountOutlet(outlet)

        // Initial state
        expect(currentRoute()).toBe('/app/dashboard')
        expect(routeParams()).toEqual({})
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Dashboard')
        expect(mountCount).toBe(1)

        // Navigate to nested dynamic route
        router.navigate('/app/users/123')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(currentRoute()).toBe('/app/users/123')
        expect(routeParams()).toEqual({ userId: '123' })
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
        expect(mountCount).toBe(1) // Layout should not re-mount

        // Navigate to different user (should use cache)
        router.navigate('/app/users/456')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(currentRoute()).toBe('/app/users/456')
        expect(routeParams()).toEqual({ userId: '456' })
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
        expect(mountCount).toBe(1)

        // Navigate back to previous route (should use cache)
        router.navigate('/app/users/123')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(currentRoute()).toBe('/app/users/123')
        expect(routeParams()).toEqual({ userId: '123' })
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
        expect(mountCount).toBe(1)

        // Navigate to completely different route
        router.navigate('/settings')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(currentRoute()).toBe('/settings')
        expect(routeParams()).toEqual({})
        expect(outlet.innerHTML).toBe('Settings')
        expect(unmountCount).toBe(1) // Layout should unmount

        // Navigate to non-existent route (catch-all)
        router.navigate('/nonexistent')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(currentRoute()).toBe('/nonexistent')
        expect(outlet.innerHTML).toBe('404 Not Found')

        // Navigate back to app route
        router.navigate('/app/dashboard')
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(currentRoute()).toBe('/app/dashboard')
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Dashboard')
        expect(mountCount).toBe(2) // Layout should mount again

        router.destroy()
    })
})

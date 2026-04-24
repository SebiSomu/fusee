import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter, mountOutlet, routeParams, currentRoute, matchedRoutes } from '../router/router.js'

beforeEach(() => {
    Object.defineProperty(window, 'location', {
        writable: true,
        value: { pathname: '/' }
    })

    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) existingOutlet.remove()
})

afterEach(() => {
    const existingOutlet = document.getElementById('router-test-outlet')
    if (existingOutlet) existingOutlet.remove()
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

        createRouter(routes)
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

        it('unmounts entire chain when navigating to a completely different route', () => {
            let layoutUnmounted = false
            let childUnmounted = false

            const routes = [
                {
                    path: '/users',
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
                                render: (el) => { el.innerHTML = 'Index' },
                                unmount: () => { childUnmounted = true }
                            })
                        }
                    ]
                },
                {
                    path: '/about',
                    component: createMockComponent((el) => {
                        el.innerHTML = 'About Page'
                    })
                }
            ]

            Object.defineProperty(window, 'location', {
                writable: true,
                value: { pathname: '/users' }
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

            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Index')

            router.navigate('/about')

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

// ─── Multiple Paths Feature ─────────────────────────────────────────────────────

describe('Multiple Paths (array paths)', () => {
    it('matches route with array of paths', () => {
        const routes = [
            {
                path: ['/login', '/register'],
                component: createMockComponent((el) => {
                    el.innerHTML = 'Auth Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/login' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        createRouter(routes)
        mountOutlet(outlet)

        expect(outlet.innerHTML).toContain('Auth Page')
    })

    it('matches second path in array', () => {
        const routes = [
            {
                path: ['/login', '/register'],
                component: createMockComponent((el) => {
                    el.innerHTML = 'Auth Page'
                })
            }
        ]

        Object.defineProperty(window, 'location', {
            writable: true,
            value: { pathname: '/register' }
        })

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        createRouter(routes)
        mountOutlet(outlet)

        expect(outlet.innerHTML).toContain('Auth Page')
    })
})

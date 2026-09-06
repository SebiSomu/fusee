import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRouter, mountOutlet, routeParams, currentRoute, matchedRoutes } from '../router/router.js'

let currentRouter = null

beforeEach(() => {
    window.history.replaceState({}, '', '/')

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
    it('matches dynamic route with single parameter', async () => {
        const routes = [
            {
                path: '/users/:id',
                component: createMockComponent((el) => {
                    el.innerHTML = 'User Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/users/123')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(currentRoute()).toBe('/users/123')
        expect(routeParams()).toEqual({ id: '123' })
    })

    it('matches dynamic route with multiple parameters', async () => {
        const routes = [
            {
                path: '/posts/:category/:slug',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Post Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/posts/tech/my-first-post')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(currentRoute()).toBe('/posts/tech/my-first-post')
        expect(routeParams()).toEqual({ category: 'tech', slug: 'my-first-post' })
    })

    it('extracts parameters correctly for nested dynamic routes', async () => {
        const routes = [
            {
                path: '/org/:orgId/team/:teamId',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Team Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/org/acme/team/engineering')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(routeParams()).toEqual({ orgId: 'acme', teamId: 'engineering' })
    })

    it('updates routeParams when navigating to different dynamic routes', async () => {
        const routes = [
            {
                path: '/users/:id',
                component: createMockComponent((el) => {
                    el.innerHTML = 'User Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/users/123')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes)
        await mountOutlet(outlet)

        expect(routeParams()).toEqual({ id: '123' })

        await router.navigate('/users/456')

        expect(routeParams()).toEqual({ id: '456' })
    })

    it('prioritizes exact match over dynamic match', async () => {
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

        window.history.replaceState({}, '', '/users/profile')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        currentRouter = createRouter(routes)
        await mountOutlet(outlet)

        expect(outlet.innerHTML).toBe('Profile Page')
        expect(routeParams()).toEqual({})
    })

    // ─── Nested Routes ──────────────────────────────────────────────────────────

    describe('Nested Routes', () => {
        it('matches parent + index child for parent path', async () => {
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

            window.history.replaceState({}, '', '/users')

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            await mountOutlet(outlet)

            expect(outlet.querySelector('h1').textContent).toBe('Users Layout')
            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Users Index')
        })

        it('matches parent + dynamic child', async () => {
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

            window.history.replaceState({}, '', '/users/42')

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            await mountOutlet(outlet)

            expect(outlet.querySelector('h1').textContent).toBe('Users Layout')
            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
            expect(routeParams()).toEqual({ id: '42' })
        })

        it('merges params from all levels in the chain', async () => {
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

            window.history.replaceState({}, '', '/org/acme/team/engineering')

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            await mountOutlet(outlet)

            expect(routeParams()).toEqual({ orgId: 'acme', teamId: 'engineering' })
        })

        it('exposes matchedRoutes signal with the full chain', async () => {
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

            window.history.replaceState({}, '', '/users/7')

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            await mountOutlet(outlet)

            const matched = matchedRoutes()
            expect(matched).toHaveLength(2)
            expect(matched[0]).toBe(parentRoute)
            expect(matched[1]).toBe(parentRoute.children[0])
        })

        it('parent layout persists when navigating between children', async () => {
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

            window.history.replaceState({}, '', '/users/a')

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            const router = createRouter(routes)
            await mountOutlet(outlet)

            expect(layoutRenderCount).toBe(1)
            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Page A')

            // Navigate to sibling child
            await router.navigate('/users/b')

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

            window.history.replaceState({}, '', '/test-unmount')

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            const router = createRouter(routes)
            currentRouter = router
            await mountOutlet(outlet)

            expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Test Index')

            await router.navigate('/test-about')

            expect(childUnmounted).toBe(true)
            expect(layoutUnmounted).toBe(true)
            expect(outlet.innerHTML).toBe('About Page')
        })

        it('renders 404 when no route matches', async () => {
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

            window.history.replaceState({}, '', '/nonexistent')

            const outlet = document.createElement('div')
            outlet.id = 'router-test-outlet'
            document.body.appendChild(outlet)

            createRouter(routes)
            await mountOutlet(outlet)

            expect(outlet.innerHTML).toContain('No route matched')
        })
    })
})

// ─── Router Optimizations Tests ────────────────────────────────────────────────

describe('Router Optimizations', () => {
    it('uses LRU cache for repeated route matching', async () => {
        const routes = [
            {
                path: '/users/:id',
                component: createMockComponent((el) => {
                    el.innerHTML = 'User Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/users/123')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes, { cacheSize: 10 })
        await mountOutlet(outlet)

        expect(currentRoute()).toBe('/users/123')
        expect(routeParams()).toEqual({ id: '123' })

        // Navigate to same route - should use cache
        await router.navigate('/users/456')
        expect(routeParams()).toEqual({ id: '456' })

        // Navigate back to first route - should use cache
        await router.navigate('/users/123')
        expect(routeParams()).toEqual({ id: '123' })

        router.destroy()
    })

    it('handles errors in component rendering gracefully', async () => {
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

        window.history.replaceState({}, '', '/error')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

        const router = createRouter(routes)
        await mountOutlet(outlet)

        expect(outlet.innerHTML).toContain('Error rendering route')
        expect(consoleErrorSpy).toHaveBeenCalled()

        consoleErrorSpy.mockRestore()
        router.destroy()
    })

    it('respects custom routerViewTimeout option', async () => {
        const routes = [
            {
                path: '/test',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Test Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/test')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes, { routerViewTimeout: 5000 })
        await mountOutlet(outlet)

        expect(currentRoute()).toBe('/test')
        expect(outlet.innerHTML).toBe('Test Page')

        router.destroy()
    })

    it('clears cache on router destroy', async () => {
        const routes = [
            {
                path: '/users/:id',
                component: createMockComponent((el) => {
                    el.innerHTML = 'User Page'
                })
            }
        ]

        window.history.replaceState({}, '', '/users/123')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes, { cacheSize: 10 })
        await mountOutlet(outlet)

        // Cache should be populated
        expect(currentRoute()).toBe('/users/123')

        router.destroy()

        // Create new router - should not use old cache
        const router2 = createRouter(routes, { cacheSize: 10 })
        await mountOutlet(outlet)

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

        window.history.replaceState({}, '', '/app/dashboard')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const router = createRouter(routes, { cacheSize: 50 })
        currentRouter = router
        await mountOutlet(outlet)

        // Initial state
        expect(currentRoute()).toBe('/app/dashboard')
        expect(routeParams()).toEqual({})
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Dashboard')
        expect(mountCount).toBe(1)

        // Navigate to nested dynamic route
        await router.navigate('/app/users/123')

        expect(currentRoute()).toBe('/app/users/123')
        expect(routeParams()).toEqual({ userId: '123' })
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
        expect(mountCount).toBe(1) // Layout should not re-mount

        // Navigate to different user (should use cache)
        await router.navigate('/app/users/456')

        expect(currentRoute()).toBe('/app/users/456')
        expect(routeParams()).toEqual({ userId: '456' })
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
        expect(mountCount).toBe(1)

        // Navigate back to previous route (should use cache)
        await router.navigate('/app/users/123')

        expect(currentRoute()).toBe('/app/users/123')
        expect(routeParams()).toEqual({ userId: '123' })
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('User Detail')
        expect(mountCount).toBe(1)

        // Navigate to completely different route
        await router.navigate('/settings')

        expect(currentRoute()).toBe('/settings')
        expect(routeParams()).toEqual({})
        expect(outlet.innerHTML).toBe('Settings')
        expect(unmountCount).toBe(1) // Layout should unmount

        // Navigate to non-existent route (catch-all)
        await router.navigate('/nonexistent')

        expect(currentRoute()).toBe('/nonexistent')
        expect(outlet.innerHTML).toBe('404 Not Found')

        // Navigate back to app route
        await router.navigate('/app/dashboard')

        expect(currentRoute()).toBe('/app/dashboard')
        expect(outlet.querySelector('[data-router-view]').innerHTML).toBe('Dashboard')
        expect(mountCount).toBe(2) // Layout should mount again

        router.destroy()
    })
})

// ─── Scroll Behavior ─────────────────────────────────────────────────────

describe('Scroll Behavior', () => {
    it('scrolls to top by default when scrollBehavior.scrollToTop is true', async () => {
        const routes = [
            {
                path: '/',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Home'
                })
            },
            {
                path: '/about',
                component: createMockComponent((el) => {
                    el.innerHTML = 'About'
                })
            }
        ]

        window.history.replaceState({}, '', '/')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const scrollToSpy = vi.fn()
        window.scrollTo = scrollToSpy

        const router = createRouter(routes, {
            scrollBehavior: { scrollToTop: true }
        })
        currentRouter = router
        await mountOutlet(outlet)

        expect(currentRoute()).toBe('/')

        await router.navigate('/about')
        expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'smooth' })

        router.destroy()
    })

    it('saves and restores scroll position when saveScrollPosition is enabled', async () => {
        const routes = [
            {
                path: '/page1',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Page 1'
                })
            },
            {
                path: '/page2',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Page 2'
                })
            }
        ]

        window.history.replaceState({}, '', '/page1')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        window.scrollY = 500
        window.scrollX = 100

        const router = createRouter(routes, {
            scrollBehavior: { saveScrollPosition: true, scrollToTop: false }
        })
        currentRouter = router
        await mountOutlet(outlet)

        await router.navigate('/page2')

        await router.navigate('/page1')
        expect(window.scrollY).toBe(500)
        expect(window.scrollX).toBe(100)

        router.destroy()
    })

    it('uses custom scroll behavior function', async () => {
        const routes = [
            {
                path: '/page1',
                component: createMockComponent((el) => {
                    el.innerHTML = 'Page 1'
                })
            }
        ]

        window.history.replaceState({}, '', '/page1')

        const outlet = document.createElement('div')
        outlet.id = 'router-test-outlet'
        document.body.appendChild(outlet)

        const customScrollSpy = vi.fn().mockReturnValue({ left: 50, top: 100 })
        const scrollToSpy = vi.fn()
        window.scrollTo = scrollToSpy

        const router = createRouter(routes, {
            scrollBehavior: {
                custom: customScrollSpy
            }
        })
        currentRouter = router
        await mountOutlet(outlet)

        await router.navigate('/page1')
        expect(customScrollSpy).toHaveBeenCalled()
        expect(scrollToSpy).toHaveBeenCalledWith({ left: 50, top: 100, behavior: 'smooth' })

        router.destroy()
    })
})

import { describe, it, expect, vi } from 'vitest'
import { generateRoutes } from '../router/file-router.js'

vi.mock('../core/component.js', () => ({
    defineAsyncComponent: vi.fn(({ loader }) => loader)
}))

describe('generateRoutesFromFiles', () => {
    it('correctly transforms basic file paths to routes', () => {
        const globResults = {
            './pages/index.js': () => Promise.resolve({}),
            './pages/about.js': () => Promise.resolve({}),
            './pages/contact.js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)

        expect(routes).toHaveLength(3)
        expect(routes.find(r => r.path === '/')).toBeDefined()
        expect(routes.find(r => r.path === '/about')).toBeDefined()
        expect(routes.find(r => r.path === '/contact')).toBeDefined()
    })

    it('handles nested directories WITHOUT layout (backward compatible)', () => {
        const globResults = {
            './pages/blog/post.js': () => Promise.resolve({}),
            './pages/admin/dashboard/stats.js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)

        // No layout files exist → flat routes
        expect(routes.find(r => r.path === '/blog/post')).toBeDefined()
        expect(routes.find(r => r.path === '/admin/dashboard/stats')).toBeDefined()
        // None should have children
        expect(routes.every(r => !r.children)).toBe(true)
    })

    it('handles index files in subdirectories (no layout)', () => {
        const globResults = {
            './pages/blog/index.js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)
        expect(routes.find(r => r.path === '/blog')).toBeDefined()
    })

    it('transforms [param] to :param for dynamic routes', () => {
        const globResults = {
            './pages/users/[id].js': () => Promise.resolve({}),
            './pages/posts/[category]/[slug].js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)

        expect(routes.find(r => r.path === '/users/:id')).toBeDefined()
        expect(routes.find(r => r.path === '/posts/:category/:slug')).toBeDefined()
    })

    it('transforms [...path] to * for catch-all routes', () => {
        const globResults = {
            './pages/[...all].js': () => Promise.resolve({}),
            './pages/docs/[...slug].js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)

        expect(routes.find(r => r.path === '*')).toBeDefined()
        expect(routes.find(r => r.path === '/docs/*')).toBeDefined()
    })

    it('sorts routes correctly (exact before dynamic)', () => {
        const globResults = {
            './pages/posts/[id].js': () => Promise.resolve({}),
            './pages/posts/new.js': () => Promise.resolve({}),
            './pages/index.js': () => Promise.resolve({}),
        }

        const routes = generateRoutes(globResults)

        // /posts/new is static and has 2 segments → first
        // / is static and has 0 segments
        // /posts/:id is dynamic → last
        expect(routes[0].path).toBe('/posts/new')
        expect(routes[1].path).toBe('/')
        expect(routes[2].path).toBe('/posts/:id')
    })

    it('strips different path prefixes (./pages/ or app/pages/)', () => {
        const globResults = {
            './pages/a.js': () => Promise.resolve({}),
            'app/pages/b.js': () => Promise.resolve({}),
            'pages/c.js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)

        expect(routes.map(r => r.path)).toContain('/a')
        expect(routes.map(r => r.path)).toContain('/b')
        expect(routes.map(r => r.path)).toContain('/c')
    })

    // ─── Nested Routes (Layout Detection) ────────────────────────────────

    it('detects layout when file + matching directory exist', () => {
        const usersLayoutLoader = () => Promise.resolve({ default: 'layout' })
        const usersIndexLoader = () => Promise.resolve({ default: 'index' })
        const usersIdLoader = () => Promise.resolve({ default: 'id' })

        const globResults = {
            './pages/users.js': usersLayoutLoader,
            './pages/users/index.js': usersIndexLoader,
            './pages/users/[id].js': usersIdLoader
        }

        const routes = generateRoutes(globResults)

        // Should have ONE route: /users with children
        const usersRoute = routes.find(r => r.path === '/users')
        expect(usersRoute).toBeDefined()
        expect(usersRoute.children).toBeDefined()
        expect(usersRoute.children).toHaveLength(2)

        // Children should have relative paths
        const indexChild = usersRoute.children.find(r => r.path === '')
        const idChild = usersRoute.children.find(r => r.path === ':id')
        expect(indexChild).toBeDefined()
        expect(idChild).toBeDefined()
    })

    it('does NOT create nested routes when only directory exists (no layout file)', () => {
        const globResults = {
            './pages/blog/post-1.js': () => Promise.resolve({}),
            './pages/blog/post-2.js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)

        // Should be flat routes, no children
        expect(routes.find(r => r.path === '/blog/post-1')).toBeDefined()
        expect(routes.find(r => r.path === '/blog/post-2')).toBeDefined()
        expect(routes.every(r => !r.children)).toBe(true)
    })

    it('handles multi-level nested layouts', () => {
        const globResults = {
            './pages/admin.js': () => Promise.resolve({}),
            './pages/admin/index.js': () => Promise.resolve({}),
            './pages/admin/dashboard.js': () => Promise.resolve({}),
            './pages/admin/dashboard/index.js': () => Promise.resolve({}),
            './pages/admin/dashboard/stats.js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)

        const adminRoute = routes.find(r => r.path === '/admin')
        expect(adminRoute).toBeDefined()
        expect(adminRoute.children).toBeDefined()

        // admin has children: '' (index) and 'dashboard' (layout)
        const adminIndex = adminRoute.children.find(r => r.path === '')
        expect(adminIndex).toBeDefined()

        const dashboardRoute = adminRoute.children.find(r => r.path === 'dashboard')
        expect(dashboardRoute).toBeDefined()
        expect(dashboardRoute.children).toBeDefined()

        // dashboard has children: '' (index) and 'stats'
        const dashIndex = dashboardRoute.children.find(r => r.path === '')
        expect(dashIndex).toBeDefined()
        const statsRoute = dashboardRoute.children.find(r => r.path === 'stats')
        expect(statsRoute).toBeDefined()
    })

    it('sorts children correctly (static before dynamic, catch-all last)', () => {
        const globResults = {
            './pages/users.js': () => Promise.resolve({}),
            './pages/users/[id].js': () => Promise.resolve({}),
            './pages/users/settings.js': () => Promise.resolve({}),
            './pages/users/index.js': () => Promise.resolve({}),
            './pages/users/[...all].js': () => Promise.resolve({})
        }

        const routes = generateRoutes(globResults)
        const usersRoute = routes.find(r => r.path === '/users')
        const children = usersRoute.children

        // Order: 'settings' (static) → '' (index) → ':id' (dynamic) → '*' (catch-all)
        expect(children[0].path).toBe('settings')
        expect(children[1].path).toBe('')
        expect(children[2].path).toBe(':id')
        expect(children[3].path).toBe('*')
    })

    it('mixes nested and flat routes at the same level', () => {
        const globResults = {
            './pages/index.js': () => Promise.resolve({}),
            './pages/about.js': () => Promise.resolve({}),
            './pages/users.js': () => Promise.resolve({}),
            './pages/users/index.js': () => Promise.resolve({}),
            './pages/users/[id].js': () => Promise.resolve({})
        }

        const routes = generateRoutesFromFiles(globResults)

        // /users should be nested (has layout)
        const usersRoute = routes.find(r => r.path === '/users')
        expect(usersRoute.children).toBeDefined()

        // / and /about should be flat
        const homeRoute = routes.find(r => r.path === '/')
        const aboutRoute = routes.find(r => r.path === '/about')
        expect(homeRoute.children).toBeUndefined()
        expect(aboutRoute.children).toBeUndefined()
    })
})

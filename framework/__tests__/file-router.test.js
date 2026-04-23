import { describe, it, expect, vi } from 'vitest'
import { generateRoutesFromFiles } from '../router/file-router.js'

// Mock defineAsyncComponent since it's used internally
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

        const routes = generateRoutesFromFiles(globResults)

        expect(routes).toHaveLength(3)
        expect(routes.find(r => r.path === '/')).toBeDefined()
        expect(routes.find(r => r.path === '/about')).toBeDefined()
        expect(routes.find(r => r.path === '/contact')).toBeDefined()
    })

    it('handles nested directories and index files', () => {
        const globResults = {
            './pages/blog/index.js': () => Promise.resolve({}),
            './pages/blog/post.js': () => Promise.resolve({}),
            './pages/admin/dashboard/index.js': () => Promise.resolve({})
        }

        const routes = generateRoutesFromFiles(globResults)

        expect(routes.find(r => r.path === '/blog')).toBeDefined()
        expect(routes.find(r => r.path === '/blog/post')).toBeDefined()
        expect(routes.find(r => r.path === '/admin/dashboard')).toBeDefined()
    })

    it('transforms [param] to :param for dynamic routes', () => {
        const globResults = {
            './pages/users/[id].js': () => Promise.resolve({}),
            './pages/posts/[category]/[slug].js': () => Promise.resolve({})
        }

        const routes = generateRoutesFromFiles(globResults)

        expect(routes.find(r => r.path === '/users/:id')).toBeDefined()
        expect(routes.find(r => r.path === '/posts/:category/:slug')).toBeDefined()
    })

    it('transforms [...path] to * for catch-all routes', () => {
        const globResults = {
            './pages/[...all].js': () => Promise.resolve({}),
            './pages/docs/[...slug].js': () => Promise.resolve({})
        }

        const routes = generateRoutesFromFiles(globResults)

        expect(routes.find(r => r.path === '*')).toBeDefined()
        expect(routes.find(r => r.path === '/docs/*')).toBeDefined()
    })

    it('sorts routes correctly (exact before dynamic)', () => {
        const globResults = {
            './pages/posts/[id].js': () => Promise.resolve({}),
            './pages/posts/new.js': () => Promise.resolve({}),
            './pages/index.js': () => Promise.resolve({}),
        }

        const routes = generateRoutesFromFiles(globResults)

        // Expected order: /posts/new, /, /posts/:id
        // /posts/new is static and has 2 segments
        // / is static and has 0 segments
        // /posts/:id is dynamic
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

        const routes = generateRoutesFromFiles(globResults)

        expect(routes.map(r => r.path)).toContain('/a')
        expect(routes.map(r => r.path)).toContain('/b')
        expect(routes.map(r => r.path)).toContain('/c')
    })
})

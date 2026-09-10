import { describe, it, expect } from 'vitest'
import { matchRoute, compileRoute } from '../server/route-matcher.js'

describe('compileRoute / matchRoute', () => {
    it('matches a static route exactly', () => {
        const routes = [{ pattern: '/about' }]
        expect(matchRoute(routes, '/about')).toMatchObject({ params: {} })
        expect(matchRoute(routes, '/about/extra')).toBeNull()
        expect(matchRoute(routes, '/aboot')).toBeNull()
    })

    it('matches a dynamic segment and extracts the param', () => {
        const routes = [{ pattern: '/blog/[slug]' }]
        const result = matchRoute(routes, '/blog/hello-world')
        expect(result.params).toEqual({ slug: 'hello-world' })
    })

    it('matches multiple dynamic segments', () => {
        const routes = [{ pattern: '/users/[id]/posts/[postId]' }]
        const result = matchRoute(routes, '/users/42/posts/7')
        expect(result.params).toEqual({ id: '42', postId: '7' })
    })

    it('decodes URI-encoded dynamic segment values', () => {
        const routes = [{ pattern: '/search/[term]' }]
        const result = matchRoute(routes, '/search/hello%20world')
        expect(result.params).toEqual({ term: 'hello world' })
    })

    it('matches a catch-all segment and keeps the raw (undecoded, slash-containing) remainder', () => {
        const routes = [{ pattern: '/docs/[...rest]' }]
        const result = matchRoute(routes, '/docs/guide/getting-started')
        expect(result.params).toEqual({ rest: 'guide/getting-started' })
    })

    it('does not match a dynamic segment against an empty path piece', () => {
        const routes = [{ pattern: '/blog/[slug]' }]
        expect(matchRoute(routes, '/blog/')).toBeNull()
        expect(matchRoute(routes, '/blog')).toBeNull()
    })

    it('tries routes in array order and returns the first match', () => {
        const routes = [
            { pattern: '/users/new' },
            { pattern: '/users/[id]' }
        ]
        expect(matchRoute(routes, '/users/new').params).toEqual({})
        expect(matchRoute(routes, '/users/42').params).toEqual({ id: '42' })
    })

    it('returns null when nothing matches', () => {
        const routes = [{ pattern: '/about' }, { pattern: '/blog/[slug]' }]
        expect(matchRoute(routes, '/nonexistent')).toBeNull()
    })

    it('matches the root path', () => {
        const routes = [{ pattern: '/' }]
        expect(matchRoute(routes, '/')).toMatchObject({ params: {} })
    })

    it('escapes regex-special characters in static segments', () => {
        const routes = [{ pattern: '/a.b+c' }]
        expect(matchRoute(routes, '/a.b+c')).not.toBeNull()
        expect(matchRoute(routes, '/aXbXc')).toBeNull() // '.' must not act as a wildcard
    })

    it('caches the compiled regex on the route object after first match', () => {
        const route = { pattern: '/blog/[slug]' }
        expect(route._compiled).toBeUndefined()
        matchRoute([route], '/blog/x')
        expect(route._compiled).toBeDefined()
        expect(route._compiled.regex).toBeInstanceOf(RegExp)
    })

    it('trailing slash is tolerated', () => {
        const routes = [{ pattern: '/about' }]
        expect(matchRoute(routes, '/about/')).not.toBeNull()
    })
})
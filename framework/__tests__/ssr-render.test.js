import { describe, it, expect } from 'vitest'
import { renderPageToStream } from '../server/render.js'
import { renderSuspenseBoundary, streamToString } from '../server/stream.js'
import { signal } from '../core/signal.js'
import { defineResource } from '../core/resource.js'

function delay(ms, v) { return new Promise(r => setTimeout(() => r(v), ms)) }

describe('renderPageToStream — the actual Steps 1+3+4 integration', () => {
    it('flushes an immediate shell, then a resolved boundary, then a dehydration tail containing BOTH signal and resource state', async () => {
        const useProfile = defineResource('profile-integration', async (id) => delay(10, { id, name: `user-${id}` }))

        function renderShell() {
            const count = signal(7) // recorded under the root signal scope
            const { data } = useProfile(1) // resource cache, separate hydration path

            const boundary = renderSuspenseBoundary({
                id: 'stats',
                fetcher: () => delay(15, { views: 42 }),
                render: (d) => `<p>${d.views} views</p>`,
                fallback: () => 'loading stats'
            })

            return `<html><body><p>count: ${count()}</p>${boundary}</body></html>`
        }

        const stream = renderPageToStream(renderShell)
        const full = await streamToString(stream)

        // 1. Shell content present (count rendered synchronously)
        expect(full).toContain('<p>count: 7</p>')
        expect(full).toContain('loading stats') // fallback, present before resolution

        // 2. Out-of-order boundary flush happened
        expect(full).toContain('<template id="tpl-stats">')
        expect(full).toContain('42 views')

        // 3. Dehydration tail present, with BOTH mechanisms represented
        expect(full).toContain('id="__FUSEE_DATA__"')
        expect(full).toContain('window.__FUSEE_STATE__')
        expect(full).toContain('"__root__"') // root signal scope id
        expect(full).toContain('"profile-integration"') // resource cache key

        // 4. Tail is genuinely LAST — appears after the boundary chunk in the stream
        const boundaryIdx = full.indexOf('tpl-stats')
        const tailIdx = full.indexOf('__FUSEE_DATA__')
        expect(tailIdx).toBeGreaterThan(boundaryIdx)
    })

    it('respects opts.dehydrate: false to omit the tail entirely', async () => {
        function renderShell() {
            signal('unused')
            return '<html>no dehydration wanted</html>'
        }

        const full = await streamToString(renderPageToStream(renderShell, { dehydrate: false }))
        expect(full).not.toContain('__FUSEE_DATA__')
        expect(full).toBe('<html>no dehydration wanted</html>')
    })

    it('two concurrent page renders never mix signal or resource state in their dehydration payloads', async () => {
        const useThing = defineResource('thing-integration', async (id) => delay(5, { id }))

        function makeShell(userId, ms) {
            return () => {
                signal(`value-for-${userId}`)
                useThing(userId)
                return `<html>${userId}</html>`
            }
        }

        const [outA, outB] = await Promise.all([
            streamToString(renderPageToStream(makeShell('A', 10))),
            streamToString(renderPageToStream(makeShell('B', 2)))
        ])

        expect(outA).toContain('value-for-A')
        expect(outA).not.toContain('value-for-B')
        expect(outB).toContain('value-for-B')
        expect(outB).not.toContain('value-for-A')
    })
})
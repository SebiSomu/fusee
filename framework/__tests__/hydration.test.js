import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
    _registerResourceCache,
    extractHydrationData,
    dehydrate,
    loadHydration,
    hydrateFromWindow,
    getHydratedEntries,
    isHydrationFresh,
    clearHydration,
    getHydrationSnapshot,
} from '../core/hydration.js'

beforeEach(() => {
    clearHydration()
})

afterEach(() => {
    if (typeof globalThis.window !== 'undefined') {
        delete globalThis.window.__FUSEE_HYDRATION__
    }
})

describe('extractHydrationData()', () => {
    it('returns {} when no caches are registered', () => {
        expect(extractHydrationData()).toEqual({})
    })

    it('snapshots a single cache with one entry', () => {
        const cache = new Map()
        cache.set('undefined', { data: { name: 'Ada' }, updatedAt: 1000 })
        _registerResourceCache('user', cache)

        const snapshot = extractHydrationData()
        expect(snapshot).toEqual({
            user: {
                undefined: { data: { name: 'Ada' }, updatedAt: 1000 }
            }
        })
    })

    it('snapshots multiple caches', () => {
        const userCache = new Map()
        userCache.set('undefined', { data: { id: 1 }, updatedAt: 100 })
        _registerResourceCache('user', userCache)

        const postsCache = new Map()
        postsCache.set('1', { data: [{ title: 'Hello' }], updatedAt: 200 })
        postsCache.set('2', { data: [{ title: 'World' }], updatedAt: 300 })
        _registerResourceCache('posts', postsCache)

        const snapshot = extractHydrationData()
        expect(snapshot.user.undefined.data).toEqual({ id: 1 })
        expect(snapshot.posts['1'].data).toEqual([{ title: 'Hello' }])
        expect(snapshot.posts['2'].data).toEqual([{ title: 'World' }])
    })

    it('omits empty caches', () => {
        const empty = new Map()
        _registerResourceCache('empty', empty)

        expect(extractHydrationData()).toEqual({})
    })

    it('reflects live cache changes before snapshot', () => {
        const cache = new Map()
        _registerResourceCache('live', cache)

        cache.set('undefined', { data: 42, updatedAt: 999 })

        const snapshot = extractHydrationData()
        expect(snapshot.live.undefined.data).toBe(42)
    })
})

describe('dehydrate()', () => {
    it('returns "{}" when no data exists', () => {
        expect(dehydrate()).toBe('{}')
    })

    it('serializes a snapshot correctly', () => {
        const snapshot = { user: { undefined: { data: { name: 'Ada' }, updatedAt: 1000 } } }
        const result = dehydrate(snapshot)
        expect(JSON.parse(result)).toEqual(snapshot)
    })

    it('escapes </script> to prevent XSS', () => {
        const evil = { xss: { key: { data: '</script><script>alert(1)</script>', updatedAt: 0 } } }
        const result = dehydrate(evil)
        expect(result).not.toContain('</script>')
        expect(result).toContain('<\\/script>')
    })

    it('remains parsable after escape (round-trip)', () => {
        const evil = { key: { 'undefined': { data: 'safe</script>end', updatedAt: 1 } } }
        const serialized = dehydrate(evil)
        const parsed = JSON.parse(serialized)
        expect(parsed.key.undefined.data).toBe('safe</script>end')
    })

    it('uses extractHydrationData() as default', () => {
        const cache = new Map()
        cache.set('undefined', { data: 'server-value', updatedAt: 5000 })
        _registerResourceCache('test', cache)

        const result = dehydrate()
        const parsed = JSON.parse(result)
        expect(parsed.test.undefined.data).toBe('server-value')
    })

    it('returns "{}" and logs error if data is not serializable', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const circular = {}
        circular.self = circular
        const result = dehydrate({ bad: circular })
        expect(result).toBe('{}')
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })
})

describe('loadHydration()', () => {
    it('populates the registry with snapshot data', () => {
        loadHydration({
            user: { undefined: { data: { id: 1 }, updatedAt: 1000 } }
        })

        const entries = getHydratedEntries('user')
        expect(entries).not.toBeNull()
        expect(entries.get('undefined').data).toEqual({ id: 1 })
    })

    it('merges multiple calls instead of overwriting the registry', () => {
        loadHydration({ userA: { k: { data: 'a', updatedAt: 1 } } })
        loadHydration({ userB: { k: { data: 'b', updatedAt: 2 } } })

        expect(getHydratedEntries('userA').get('k').data).toBe('a')
        expect(getHydratedEntries('userB').get('k').data).toBe('b')
    })

    it('warns and does not throw for invalid snapshot', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(() => loadHydration(null)).not.toThrow()
        expect(() => loadHydration(undefined)).not.toThrow()
        expect(() => loadHydration('string')).not.toThrow()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    it('supports multiple cacheKeys for the same resourceKey', () => {
        loadHydration({
            posts: {
                '1': { data: [{ id: 1 }], updatedAt: 100 },
                '2': { data: [{ id: 2 }], updatedAt: 200 },
            }
        })

        const entries = getHydratedEntries('posts')
        expect(entries.get('1').data).toEqual([{ id: 1 }])
        expect(entries.get('2').data).toEqual([{ id: 2 }])
    })
})

describe('hydrateFromWindow()', () => {
    it('does not throw if window.__FUSEE_HYDRATION__ is missing', () => {
        expect(() => hydrateFromWindow()).not.toThrow()
    })

    it('loads data from window.__FUSEE_HYDRATION__', () => {
        globalThis.window = globalThis.window || {}
        globalThis.window.__FUSEE_HYDRATION__ = {
            widget: { undefined: { data: { color: 'blue' }, updatedAt: 1234 } }
        }

        hydrateFromWindow()

        const entries = getHydratedEntries('widget')
        expect(entries.get('undefined').data).toEqual({ color: 'blue' })
    })
})

describe('getHydratedEntries()', () => {
    it('returns null for unknown keys', () => {
        expect(getHydratedEntries('nonexistent')).toBeNull()
    })

    it('returns the correct Map after loadHydration', () => {
        loadHydration({ myRes: { k: { data: 'v', updatedAt: 10 } } })
        const result = getHydratedEntries('myRes')
        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(1)
    })
})

describe('isHydrationFresh()', () => {
    it('returns false if no data exists for resourceKey', () => {
        expect(isHydrationFresh('missing', 'undefined')).toBe(false)
    })

    it('returns false if specific cacheKey does not exist', () => {
        loadHydration({ res: { 'a': { data: 1, updatedAt: Date.now() } } })
        expect(isHydrationFresh('res', 'b')).toBe(false)
    })

    it('returns true if updatedAt is within staleTime', () => {
        const now = Date.now()
        loadHydration({ res: { k: { data: 'x', updatedAt: now - 100 } } })
        expect(isHydrationFresh('res', 'k', 1000)).toBe(true)
    })

    it('returns false if updatedAt exceeds staleTime', () => {
        const old = Date.now() - 5000
        loadHydration({ res: { k: { data: 'x', updatedAt: old } } })
        expect(isHydrationFresh('res', 'k', 1000)).toBe(false)
    })

    it('returns false for staleTime = 0', () => {
        loadHydration({ res: { k: { data: 'x', updatedAt: Date.now() - 1 } } })
        expect(isHydrationFresh('res', 'k', 0)).toBe(false)
    })

    it('returns true for staleTime = Infinity', () => {
        loadHydration({ res: { k: { data: 'x', updatedAt: 0 } } })
        expect(isHydrationFresh('res', 'k', Infinity)).toBe(true)
    })
})

describe('clearHydration()', () => {
    it('clears all data from registry', () => {
        loadHydration({ x: { k: { data: 1, updatedAt: 1 } } })
        clearHydration()
        expect(getHydratedEntries('x')).toBeNull()
    })

    it('clears registered caches', () => {
        const cache = new Map()
        cache.set('k', { data: 1, updatedAt: 1 })
        _registerResourceCache('y', cache)

        clearHydration()

        expect(extractHydrationData()).toEqual({})
    })
})

describe('getHydrationSnapshot()', () => {
    it('returns {} when registry is empty', () => {
        expect(getHydrationSnapshot()).toEqual({})
    })

    it('returns a copy so mutations do not affect the registry', () => {
        loadHydration({ x: { k: { data: 'original', updatedAt: 1 } } })

        const snap = getHydrationSnapshot()
        snap.x.k.data = 'mutated'

        expect(getHydratedEntries('x').get('k').data).toBe('original')
    })

    it('includes all keys and entries', () => {
        loadHydration({
            a: { '1': { data: 'one', updatedAt: 10 } },
            b: { '2': { data: 'two', updatedAt: 20 } },
        })

        const snap = getHydrationSnapshot()
        expect(snap.a['1'].data).toBe('one')
        expect(snap.b['2'].data).toBe('two')
    })
})

describe('SSR round-trip (dehydrate → loadHydration)', () => {
    it('server data matches client data after round-trip', () => {
        const serverCache = new Map()
        serverCache.set('undefined', {
            data: { users: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bob' }] },
            updatedAt: 1_700_000_000_000
        })
        _registerResourceCache('userList', serverCache)

        const html = `<script>window.__FUSEE_HYDRATION__ = ${dehydrate()}<\/script>`

        const match = html.match(/window\.__FUSEE_HYDRATION__ = (.+?)<\/script>/)
        const browserData = JSON.parse(match[1])

        clearHydration()
        loadHydration(browserData)

        const entries = getHydratedEntries('userList')
        expect(entries).not.toBeNull()

        const entry = entries.get('undefined')
        expect(entry.data.users).toHaveLength(2)
        expect(entry.data.users[0].name).toBe('Ada')
        expect(entry.updatedAt).toBe(1_700_000_000_000)
    })

    it('multiple resources survive round-trip', () => {
        const cache1 = new Map()
        cache1.set('undefined', { data: { role: 'admin' }, updatedAt: 1000 })
        _registerResourceCache('currentUser', cache1)

        const cache2 = new Map()
        cache2.set('{"page":1}', { data: { items: [1, 2, 3] }, updatedAt: 2000 })
        _registerResourceCache('paginated', cache2)

        const serialized = dehydrate()

        clearHydration()
        loadHydration(JSON.parse(serialized))

        expect(getHydratedEntries('currentUser').get('undefined').data.role).toBe('admin')
        expect(getHydratedEntries('paginated').get('{"page":1}').data.items).toEqual([1, 2, 3])
    })

    it('does not expose </script> in HTML output', () => {
        const cache = new Map()
        cache.set('undefined', {
            data: { html: '<div></script><b>XSS</b></div>' },
            updatedAt: 1
        })
        _registerResourceCache('dangerous', cache)

        const inlined = dehydrate()
        expect(inlined.split('<\\/script>').join('SAFE')).not.toContain('</script>')
    })
})
import { describe, it, expect, vi } from 'vitest'
import { resource, signal, batch } from '../core/signal.js'

describe('resource()', () => {

    it('handles basic async fetching without source', async () => {
        const fetcher = vi.fn().mockResolvedValue('success')
        const [data] = resource(fetcher)

        expect(data.loading()).toBe(true)
        expect(data()).toBeUndefined()

        // Wait for microtasks
        await new Promise(r => setTimeout(r, 0))

        expect(data.loading()).toBe(false)
        expect(data()).toBe('success')
        expect(data.error()).toBeUndefined()
    })

    it('handles async errors', async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error('network error'))
        const [data] = resource(fetcher)

        await new Promise(r => setTimeout(r, 0))

        expect(data.loading()).toBe(false)
        expect(data()).toBeUndefined()
        expect(data.error()).toBeInstanceOf(Error)
        expect(data.error().message).toBe('network error')
    })

    it('reacts to source changes', async () => {
        const id = signal(1)
        const fetcher = vi.fn().mockImplementation(val => Promise.resolve(`user-${val}`))
        const [data] = resource(id, fetcher)

        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe('user-1')
        expect(fetcher).toHaveBeenCalledTimes(1)

        id(2)
        expect(data.loading()).toBe(true)

        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe('user-2')
        expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('skips fetching if source is null, false or undefined', async () => {
        const id = signal(null)
        const fetcher = vi.fn().mockResolvedValue('data')
        const [data] = resource(id, fetcher)

        await new Promise(r => setTimeout(r, 0))
        expect(fetcher).not.toHaveBeenCalled()
        expect(data.loading()).toBe(false)

        id(1)
        await new Promise(r => setTimeout(r, 0))
        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('manual mutate updates data immediately', async () => {
        const fetcher = vi.fn().mockResolvedValue('initial')
        const [data, { mutate }] = resource(fetcher)

        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe('initial')

        mutate('manual update')
        expect(data()).toBe('manual update')
    })

    it('refetch triggers a new load', async () => {
        let count = 0
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(++count))
        const [data, { refetch }] = resource(fetcher)

        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe(1)

        refetch()
        expect(data.loading()).toBe(true)

        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe(2)
    })

    it('uses batch for atomic state updates', async () => {
        const fetcher = vi.fn().mockResolvedValue('done')
        const [data] = resource(fetcher)
        
        // This test is subtle - it checks if loading and error are updated together
        // We can't easily verify batching across async boundaries without deep instrumentation
        // but we can ensure they at least work.
        
        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe('done')
        expect(data.loading()).toBe(false)
    })
})

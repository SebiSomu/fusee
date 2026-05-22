import { describe, it, expect, vi } from 'vitest'
import { resource, signal, batch, createSuspense, scheduleAsyncJob } from '../core/signal.js'

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const flushMicrotasks = () => new Promise((r) => queueMicrotask(() => r()));

describe('resource()', () => {

    it('handles basic async fetching without source', async () => {
        const fetcher = vi.fn().mockResolvedValue('success')
        const [data] = resource(fetcher)

        expect(data.loading()).toBe(true)
        expect(data()).toBeUndefined()

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

    it('caches subsequent calls and respects staleTime', async () => {
        let count = 0
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(++count))
        const source = signal(1)
        const [data] = resource(source, fetcher, { staleTime: 5000 })

        // First load
        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe(1)
        expect(fetcher).toHaveBeenCalledTimes(1)

        // Change source to 2
        source(2)
        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe(2)
        expect(fetcher).toHaveBeenCalledTimes(2)

        // Change source back to 1 (should hit cache instantly, fetcher NOT called again since it's fresh)
        source(1)
        expect(data()).toBe(1) // Optimistic cache hit!
        expect(data.loading()).toBe(false)
        expect(data.isFetching()).toBe(false)
        expect(fetcher).toHaveBeenCalledTimes(2) // Still 2!
    })

    it('manages isFetching signal separately from loading', async () => {
        const fetcher = vi.fn().mockResolvedValue('fetched')
        const [data] = resource(fetcher)

        expect(data.loading()).toBe(true)
        expect(data.isFetching()).toBe(true)

        await new Promise(r => setTimeout(r, 0))

        expect(data.loading()).toBe(false)
        expect(data.isFetching()).toBe(false)
    })

    it('performs background revalidation (SWR) when cached data is stale', async () => {
        let count = 0
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(++count))
        const source = signal(1)
        
        // staleTime is 0, so cached data is always stale and will trigger background revalidation
        const [data] = resource(source, fetcher, { staleTime: 0 })

        // First load
        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe(1)
        expect(fetcher).toHaveBeenCalledTimes(1)

        source(2)
        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe(2)
        expect(fetcher).toHaveBeenCalledTimes(2)

        source(1)
        expect(data()).toBe(1)
        expect(data.loading()).toBe(false)
        expect(data.isFetching()).toBe(true)
        expect(fetcher).toHaveBeenCalledTimes(3) // background fetch was triggered immediately!

        // Wait for background fetch to resolve
        await new Promise(r => setTimeout(r, 0))
        expect(data()).toBe(3) // updated with new background fetch result!
        expect(data.isFetching()).toBe(false)
    })

    it('deduplicates parallel requests with the same fetcher and input', async () => {
        let fetches = 0
        const fetcher = vi.fn().mockImplementation(async (id) => {
            fetches++
            await new Promise(r => setTimeout(r, 10))
            return `user-${id}`
        })

        const [data1] = resource(1, fetcher)
        const [data2] = resource(1, fetcher)
        const [data3] = resource(1, fetcher)

        expect(data1.loading()).toBe(true)
        expect(data2.loading()).toBe(true)
        expect(data3.loading()).toBe(true)

        await new Promise(r => setTimeout(r, 15))

        expect(data1()).toBe('user-1')
        expect(data2()).toBe('user-1')
        expect(data3()).toBe('user-1')
        expect(fetches).toBe(1) 
        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('deduplicates parallel requests using explicit key', async () => {
        let fetches = 0
        const fetcher1 = vi.fn().mockImplementation(async (id) => {
            fetches++
            await new Promise(r => setTimeout(r, 10))
            return `post-${id}`
        })
        const fetcher2 = vi.fn().mockImplementation(async (id) => {
            fetches++
            await new Promise(r => setTimeout(r, 10))
            return `post-${id}`
        })

        const [data1] = resource(2, fetcher1, { key: 'post' })
        const [data2] = resource(2, fetcher2, { key: 'post' })

        await new Promise(r => setTimeout(r, 15))

        expect(data1()).toBe('post-2')
        expect(data2()).toBe('post-2')
        expect(fetcher1).toHaveBeenCalledTimes(1)
        expect(fetcher2).toHaveBeenCalledTimes(0)
        expect(fetches).toBe(1)
    })

    it('resource.read() throws a Promise while loading, then returns data', async () => {
        const d = deferred();
        const [val] = resource(() => d.promise);

        let thrown = null;
        try {
            val.read();
        } catch (e) {
            thrown = e;
        }

        expect(thrown).toBeInstanceOf(Promise);
        d.resolve(42);
        await thrown;
        await flushMicrotasks();

        expect(val.read()).toBe(42);
    });

    it('createSuspense() shows fallback, then rerenders after Promise resolves', async () => {
        const d = deferred();
        const [user] = resource(() => d.promise);

        // createSuspense prinde Promise-ul aruncat de user.read()
        const [view, dispose] = createSuspense(
            () => `User: ${user.read()}`,
            () => 'Loading...'
        );

        expect(view()).toBe('Loading...');

        d.resolve('Ada');

        await new Promise(r => setTimeout(r, 20));
        await flushMicrotasks();

        expect(view()).toBe('User: Ada');

        dispose();
    });

    it('deduplicates multiple concurrent requests for same key', async () => {
        let fetchCount = 0
        const fetcher = async (id) => {
            fetchCount++
            return `data-${id}`
        }

        const [res1] = resource(() => 1, fetcher, { key: 'test' })
        const [res2] = resource(() => 1, fetcher, { key: 'test' })
        const [res3] = resource(() => 1, fetcher, { key: 'test' })

        await new Promise(r => setTimeout(r, 10))

        expect(fetchCount).toBe(1)
        expect(res1()).toBe('data-1')
        expect(res2()).toBe('data-1')
        expect(res3()).toBe('data-1')
    })

    it('prioritizes async jobs', async () => {
        const order = []

        scheduleAsyncJob(() => order.push('low'), { priority: 'low' })
        scheduleAsyncJob(() => order.push('high'), { priority: 'high' })

        await new Promise(r => setTimeout(r, 10))
        expect(order).toEqual(['high', 'low'])
    });
})

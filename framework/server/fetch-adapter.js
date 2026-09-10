export function createFetchHandler(renderToStream, opts = {}) {
    return async function fetchHandler(request) {
        let stream
        try {
            stream = await renderToStream(request)
        } catch (err) {
            console.error('[fusée] fetch handler error:', err)
            return new Response('Internal Server Error', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' }
            })
        }

        return new Response(stream, {
            status: opts.status ?? 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                ...opts.headers
            }
        })
    }
}

export const createBunHandler = createFetchHandler
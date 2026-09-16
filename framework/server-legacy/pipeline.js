import { createRequestContext, withRequestContext } from './index.js'

/** Wraps a request handler in isolated context and consistent 500 error handling. */
export function createRequestPipeline(handler) {
    return function requestListener(req, res) {
        const ctx = createRequestContext()

        withRequestContext(ctx, async () => {
            try {
                await handler(req, res)
            } catch (err) {
                console.error('[fusée] request pipeline error:', err)
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' })
                    res.end('Internal Server Error')
                } else {
                    res.destroy(err)
                }
            }
        }).catch(err => {
            console.error('[fusée] unrecoverable request pipeline error:', err)
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' })
                res.end('Internal Server Error')
            }
        })
    }
}
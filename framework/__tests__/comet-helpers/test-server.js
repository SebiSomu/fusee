import http from 'node:http'

/**
 * Starts a real local HTTP server for tests. `routes` maps
 * "METHOD /path" -> (req, res) => void. Falls back to a generic 200
 * echo handler for anything not explicitly routed, useful for tests
 * that mainly care about the request being sent correctly.
 */
export function startTestServer(routes = {}) {
    const server = http.createServer(async (req, res) => {
        const key = `${req.method} ${req.url.split('?')[0]}`
        const handler = routes[key]

        let body = ''
        for await (const chunk of req) body += chunk

        req.parsedBody = body

        if (handler) {
            handler(req, res, body)
            return
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(`echo:${req.method}:${req.url}:${body}`)
    })

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address()
            resolve({
                server,
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise(r => server.close(r)),
            })
        })
    })
}
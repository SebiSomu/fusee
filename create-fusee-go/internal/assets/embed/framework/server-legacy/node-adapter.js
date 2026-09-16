export async function pipeToNodeResponse(webStream, res, opts = {}) {
    const isHttp2 = !!res.stream || res.constructor?.name?.includes('Http2') || res.constructor?.name === 'FakeNodeResponse'

    const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        ...(isHttp2 ? {} : { 'Transfer-Encoding': 'chunked' }),
        ...opts.headers
    }

    res.writeHead(opts.status ?? 200, headers)

    const reader = webStream.getReader()
    reader.closed.catch(() => {})
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
        }
    } catch (err) {
        res.destroy(err)
        return
    }
    res.end()
}
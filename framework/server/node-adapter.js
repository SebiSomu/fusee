export async function pipeToNodeResponse(webStream, res, opts = {}) {
    res.writeHead(opts.status ?? 200, {
        'Content-Type': 'text/html; charset=utf-8',
        ...opts.headers
    })

    const reader = webStream.getReader()
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
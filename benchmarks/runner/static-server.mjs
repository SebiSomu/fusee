import http from 'node:http'
import handler from 'serve-handler'
import path from 'node:path'
import { APPS_DIR } from './config.mjs'

export function startStaticServer(frameworkId, port) {
    const dist = path.join(APPS_DIR, frameworkId, 'dist')

    const server = http.createServer((req, res) => {
        handler(req, res, {
            public: dist,
            cleanUrls: false,
            rewrites: [{ source: '**', destination: '/index.html' }],
        })
    })

    return new Promise((resolve, reject) => {
        server.on('error', reject)
        server.listen(port, () => resolve(server))
    })
}

export function stopStaticServer(server) {
    return new Promise((resolve) => server.close(() => resolve()))
}

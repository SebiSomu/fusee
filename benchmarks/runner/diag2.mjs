import { chromium } from 'playwright'
import http from 'node:http'
import handler from 'serve-handler'
import path from 'node:path'

const dist = path.join(process.cwd(), 'apps', 'fusee', 'dist')
const server = http.createServer((req, res) =>
    handler(req, res, { public: dist, rewrites: [{ source: '**', destination: '/index.html' }] })
)
await new Promise((r) => server.listen(4099, r))

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
page.on('console', (m) => console.log('CONSOLE:', m.type(), m.text()))
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
await page.goto('http://localhost:4099/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const has = await page.evaluate(() => typeof window.__bench)
console.log('typeof window.__bench =', has)
if (has === 'object') {
    try {
        await page.evaluate(() => window.__bench.create(1000))
        await page.waitForTimeout(500)
        const count = await page.evaluate(() => document.querySelectorAll('.col-id').length)
        console.log('row count after create(1000) =', count)
    } catch (e) {
        console.log('create() threw or hung:', e.message)
    }
}
await browser.close()
server.close()

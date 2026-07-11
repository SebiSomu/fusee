import { chromium } from 'playwright'
import { WARMUP_RUNS } from './config.mjs'

const TEST_SETUP = {
    create: null,
    update: 'create',
    swap: 'create',
    clear: 'create',
}

/**
 * Runs `window.__bench[setupOp]?.(rows)` then measures the wall-clock time
 * (via performance.now()) of `window.__bench[op](rows)` up to two settled
 * animation frames after the call resolves, so we capture full paint time.
 */
async function measureOnce(page, op, rows, setupOp) {
    return page.evaluate(
        async ({ op, rows, setupOp }) => {
            const settle = () =>
                new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

            if (setupOp) {
                await window.__bench[setupOp](rows)
                await settle()
            }

            const start = performance.now()
            await window.__bench[op](rows)
            await settle()
            const end = performance.now()

            return end - start
        },
        { op, rows, setupOp }
    )
}

export async function measureFramework(fw, tests, { runs, headless = true, onProgress } = {}) {
    const browser = await chromium.launch({
        headless,
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    })
    const results = {}

    try {
        for (const test of tests) {
            const page = await browser.newPage()
            const url = `http://localhost:${fw.port}/`
            const times = []

            try {
                await page.goto(url, { waitUntil: 'networkidle' })
                await page.waitForFunction(() => typeof window.__bench?.create === 'function', {
                    timeout: 15000,
                })

                const setupOp = TEST_SETUP[test.id]

                // Warmup (not measured) - lets JIT warm up + avoids cold-start noise
                for (let i = 0; i < WARMUP_RUNS; i++) {
                    await measureOnce(page, test.id, test.rows, setupOp)
                    // reset between iterations so every run starts from the same state
                    await page.evaluate(() => window.__bench.clear())
                    await page.evaluate(
                        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
                    )
                }

                for (let i = 0; i < runs; i++) {
                    const ms = await measureOnce(page, test.id, test.rows, setupOp)
                    times.push(ms)
                    await page.evaluate(() => window.__bench.clear())
                    await page.evaluate(
                        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
                    )
                    onProgress?.(fw, test, i + 1, runs)
                }

                results[test.id] = summarize(times)
            } catch (err) {
                results[test.id] = { error: String(err?.message ?? err) }
            } finally {
                await page.close()
            }
        }
    } finally {
        await browser.close()
    }

    return results
}

function summarize(times) {
    const sorted = [...times].sort((a, b) => a - b)
    const sum = sorted.reduce((a, b) => a + b, 0)
    const mean = sum / sorted.length
    const median = sorted[Math.floor(sorted.length / 2)]
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const variance = sorted.reduce((acc, t) => acc + (t - mean) ** 2, 0) / sorted.length
    const stddev = Math.sqrt(variance)

    return { mean, median, min, max, stddev, samples: sorted }
}

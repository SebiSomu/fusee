import { createRequestContext, withRequestContext } from './index.js'

const DEFAULT_MAX_PASSES = 10

export async function renderPageSSR(runPass, opts = {}) {
    const maxPasses = opts.maxPasses ?? DEFAULT_MAX_PASSES
    const ctx = createRequestContext()

    return withRequestContext(ctx, async () => {
        let passes = 0
        let result
        let pending = []

        do {
            ctx.inFlightMaps.byKey.clear()
            result = await runPass()
            pending = [...ctx.inFlightMaps.byKey.values()]
            if (pending.length > 0) {
                await Promise.allSettled(pending)
            }
            passes++
        } while (pending.length > 0 && passes < maxPasses)

        if (pending.length > 0) {
            console.warn(
                `[fusée] renderPageSSR: exceeded ${maxPasses} suspense passes with resources still pending — rendering with incomplete data`
            )
        }

        return result
    })
}
import { AsyncLocalStorage } from 'node:async_hooks'
import { _registerALS } from '../core/async-context.js'

const _als = new AsyncLocalStorage()
_registerALS(_als)

export function createRequestContext() {
    return {
        inFlightMaps: {
            byKey: new Map(),
            byFetcher: new WeakMap()
        },
        // Step 2: isolates hydration.js's resource-cache bookkeeping per
        // request, same shape as the old module-level _registeredCaches.
        resourceRegistry: {
            caches: []
        },
        // Step 3: per-request list of suspense boundaries registered
        // during the shell render, so createSSRStreamResponse() knows
        // what to wait for and stream in after the shell is flushed.
        streamBoundaries: {
            list: [],
            nextId: 0
        },
        // Step 4: positional signal-state scope, isolated per request.
        signalScope: {
            stack: [],
            registry: new Map()
        }
    }
}

export function withRequestContext(ctx, fn) {
    return _als.run(ctx, fn)
}

export { renderPageSSR } from './ssr-render.js'
export { createSSRStreamResponse, renderSuspenseBoundary, streamToString } from './server.js'
export { pipeToNodeResponse } from './node-adapter.js'
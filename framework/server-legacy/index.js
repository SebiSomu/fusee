import { AsyncLocalStorage } from 'node:async_hooks'
import { _registerALS, _registerScopeALS } from '../core/async-context.js'

const _als = new AsyncLocalStorage()
_registerALS(_als)
const _scopeALS = new AsyncLocalStorage()
_registerScopeALS(_scopeALS)

export function createRequestContext() {
    return {
        inFlightMaps: {
            byKey: new Map(),
            byFetcher: new WeakMap()
        },
        resourceRegistry: {
            caches: []
        },
        streamBoundaries: {
            list: [],
            nextId: 0
        },
        signalScope: {
            registry: new Map()
        }
    }
}

export function withRequestContext(ctx, fn) {
    return _als.run(ctx, fn)
}

export { renderSuspenseBoundary, createSSRStreamResponse, streamToString } from './stream.js'
export { pipeToNodeResponse } from './node-adapter.js'
export { createDispatcher, defaultActionsBasePath } from './dispatcher.js'
export { defineAction, handleActionRequest, getRegisteredActions } from './actions.server.js'
export { createRequestPipeline } from './pipeline.js'
export { resolveStaticFile, serveStaticFile } from './static-assets.js'
export { matchRoute, compileRoute } from './route-matcher.js'
export { renderPageSSR } from './ssr-render.js'
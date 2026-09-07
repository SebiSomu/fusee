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
        resourceRegistry: {
            caches: []
        }
    }
}

export function withRequestContext(ctx, fn) {
    return _als.run(ctx, fn)
}

export { renderPageSSR } from './ssr-render.js'
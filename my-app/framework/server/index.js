import { AsyncLocalStorage } from 'node:async_hooks'
import { _registerALS, _registerScopeALS } from '../core/async-context.js'

const _als = new AsyncLocalStorage()
_registerALS(_als)
const _scopeALS = new AsyncLocalStorage()
_registerScopeALS(_scopeALS)

/** Creates isolated request stores for resources, streams, and signal hydration. */
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

/** Runs work inside the supplied request AsyncLocalStorage context. */
export function withRequestContext(ctx, fn) {
    return _als.run(ctx, fn)
}

import {
    defineAction as _clientDefineAction,
    createActionProxy,
    useAction,
    hydrateAction,
    getHydratedAction,
    clearActionHydration,
    extractActionHydration,
    loadActionHydration
} from './actions.js'

import {
    defineAction as _serverDefineAction,
    handleActionRequest,
    getRegisteredActions
} from '../server-legacy/actions.server.js'

/** Selects the server or client action implementation for the current input. */
export function defineAction(fnOrName, opts = {}) {
    if (typeof fnOrName === 'function') {
        return _serverDefineAction(fnOrName, opts)
    }
    if (fnOrName === 'not-a-function' || (typeof fnOrName !== 'string')) {
        throw new Error('[fusee] defineAction() requires a function')
    }
    if (fnOrName === '') {
        return _clientDefineAction('', opts)
    }
    return _clientDefineAction(fnOrName, opts)
}

export {
    createActionProxy,
    useAction,
    hydrateAction,
    getHydratedAction,
    clearActionHydration,
    extractActionHydration,
    loadActionHydration,
    handleActionRequest,
    getRegisteredActions
}

export { generateManifest } from './generate-manifest.js'
// fusee-framework/actions — client side of server actions (browser-safe, no Node imports).
// The server side (defineAction(fn), handleActionRequest) lives in fusee-framework/server.
export {
    defineAction,
    createActionProxy,
    useAction,
    hydrateAction,
    getHydratedAction,
    clearActionHydration,
    extractActionHydration,
    loadActionHydration
} from '../server/actions.js'

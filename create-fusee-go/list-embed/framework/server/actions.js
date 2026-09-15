import { signal, batch } from '../core/signal.js'
import { getCurrentInstance } from '../core/component.js'

const ACTION_BASE_URL = '/__fusee/actions'
const _actionHydrationRegistry = new Map()

export function defineAction(fnOrName, opts = {}) {
    const name = opts.name
        || (typeof fnOrName === 'function' ? fnOrName.name : fnOrName)

    if (!name) {
        throw new Error('[fusee] defineAction() client stub: nu s-a putut determina numele acțiunii')
    }

    return createActionProxy(name, opts)
}

export function createActionProxy(name, opts = {}) {
    const baseUrl = opts.baseUrl ?? ACTION_BASE_URL

    async function actionProxy(...args) {
        const res = await fetch(`${baseUrl}/${name}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(opts.headers ?? {})
            },
            body: JSON.stringify({ args })
        })

        const json = await res.json()

        if (!res.ok) {
            const err = new Error(json.error ?? `Action "${name}" failed (${res.status})`)
            err.status = res.status
            err.code = json.code
            throw err
        }

        return json.data
    }

    actionProxy._isAction = true
    actionProxy._actionName = name

    return actionProxy
}

export function useAction(action, opts = {}) {
    if (typeof action !== 'function') {
        throw new Error('[fusee] useAction() requires an action function (result of defineAction or createActionProxy)')
    }

    const pending = signal(false)
    const data = signal(undefined)
    const error = signal(undefined)

    const { onSuccess, onError, resetOnCall = true } = opts

    let callId = 0

    async function execute(...args) {
        const id = ++callId

        batch(() => {
            pending(true)
            if (resetOnCall) {
                data(undefined)
                error(undefined)
            }
        })

        try {
            const result = await action(...args)

            if (id !== callId) return result

            batch(() => {
                data(result)
                pending(false)
            })

            if (typeof onSuccess === 'function') {
                onSuccess(result)
            }

            return result
        } catch (err) {
            if (id !== callId) return

            batch(() => {
                error(err)
                pending(false)
            })

            if (typeof onError === 'function') {
                onError(err)
            } else {
                console.error(`[fusee] useAction("${action._actionName ?? '?'}") error:`, err)
            }
        }
    }

    function reset() {
        batch(() => {
            pending(false)
            data(undefined)
            error(undefined)
        })
        callId++
    }

    const instance = getCurrentInstance()
    if (instance) {
        instance._unmountHooks.push(() => {
            callId++
        })
    }

    return { execute, pending, data, error, reset }
}

export function hydrateAction(actionName, data, opts = {}) {
    const key = `action:${actionName}`
    _actionHydrationRegistry.set(key, {
        data,
        timestamp: Date.now(),
        staleTime: opts.staleTime ?? 0
    })
}

export function getHydratedAction(actionName, staleTime) {
    const key = `action:${actionName}`
    const entry = _actionHydrationRegistry.get(key)
    if (!entry) return undefined

    if (staleTime !== undefined && (Date.now() - entry.timestamp) > staleTime) {
        return undefined
    }
    if (entry.staleTime && (Date.now() - entry.timestamp) > entry.staleTime) {
        return undefined
    }

    return entry.data
}

export function clearActionHydration() {
    _actionHydrationRegistry.clear()
}

export function extractActionHydration() {
    const snapshot = {}
    for (const [key, entry] of _actionHydrationRegistry) {
        snapshot[key] = {
            data: entry.data,
            timestamp: entry.timestamp,
            staleTime: entry.staleTime
        }
    }
    return snapshot
}

export function loadActionHydration(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return

    for (const [key, entry] of Object.entries(snapshot)) {
        _actionHydrationRegistry.set(key, {
            data: entry.data,
            timestamp: entry.timestamp,
            staleTime: entry.staleTime
        })
    }
}
import { withRequestContext, createRequestContext } from './index.js'

const _actionRegistry = new Map()

export function defineAction(fn, opts = {}) {
    if (typeof fn !== 'function') {
        throw new Error('[fusee] defineAction() requires a function')
    }

    const name = opts.name || fn.name
    if (!name) {
        throw new Error(
            '[fusee] defineAction(): funcția trebuie să aibă un nume sau să specifici opts.name'
        )
    }

    const wrapped = async function (...args) {
        if (opts.authorize) {
            await opts.authorize(...args)
        }
        return fn(...args)
    }

    wrapped._isAction = true
    wrapped._actionName = name
    _actionRegistry.set(name, { fn: wrapped, opts })

    return wrapped
}

export async function handleActionRequest(req, res) {
    let actionName
    if (req.params?.name) {
        actionName = req.params.name
    } else {
        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.split('/')
        actionName = parts[parts.length - 1]
    }

    const entry = _actionRegistry.get(actionName)
    if (!entry) {
        return _sendJson(res, 404, { error: `Action "${actionName}" not found` })
    }

    let body
    try {
        body = req.body ?? (await _parseBody(req))
    } catch {
        return _sendJson(res, 400, { error: 'Invalid JSON body' })
    }

    const args = Array.isArray(body?.args) ? body.args : body != null ? [body] : []
    const ctx = createRequestContext()

    try {
        const data = await withRequestContext(ctx, () => entry.fn(...args))
        return _sendJson(res, 200, { data: data ?? null })
    } catch (err) {
        const isPublic = err?.expose === true
        console.error(`[fusee] Action "${actionName}" threw:`, err)
        return _sendJson(res, err?.status ?? 500, {
            error: isPublic ? err.message : 'Internal server error',
            code: err?.code
        })
    }
}

export function getRegisteredActions() {
    return [..._actionRegistry.keys()]
}

async function _parseBody(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function _sendJson(res, status, body) {
    if (typeof res.status === 'function') {
        return res.status(status).json(body)
    }

    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}
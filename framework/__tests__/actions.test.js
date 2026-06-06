import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    defineAction as serverDefineAction,
    handleActionRequest,
    getRegisteredActions
} from '../server/actions.server.js'

import {
    defineAction as clientDefineAction,
    createActionProxy,
    useAction as clientUseAction
} from '../server/actions.js'

let _counter = 0
function uniqueName(base) {
    return `__test_${base}_${++_counter}`
}

function createMockRes() {
    let lastStatusCode = 200
    const res = {
        status: vi.fn((code) => {
            lastStatusCode = code
            return res
        }),
        json: vi.fn((body) => ({ status: lastStatusCode, body }))
    }
    return res
}

function createMockReq(params = {}, body = null, url = 'http://localhost/__fusee/actions/test') {
    return { params, body, url }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT-SIDE TESTS (actions.js)
// ═══════════════════════════════════════════════════════════════════════════════

describe('client actions (actions.js)', () => {

    beforeEach(() => {
        global.fetch = vi.fn()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // ─── defineAction ─────────────────────────────────────────────────────────

    describe('defineAction', () => {
        it('returns a proxy when given a named function', () => {
            const action = clientDefineAction(async function myAction() { return 42 })
            expect(typeof action).toBe('function')
            expect(action._isAction).toBe(true)
            expect(action._actionName).toBe('myAction')
        })

        it('returns a proxy when given an explicit name string', () => {
            const action = clientDefineAction('customName')
            expect(typeof action).toBe('function')
            expect(action._isAction).toBe(true)
            expect(action._actionName).toBe('customName')
        })

        it('returns a proxy when given explicit opts.name', () => {
            const action = clientDefineAction(async function foo() {}, { name: 'bar' })
            expect(action._actionName).toBe('bar')
        })

        it('throws when no name can be determined (empty string name)', () => {
            // An explicitly empty string name should throw
            expect(() => clientDefineAction('')).toThrow(
                '[fusee] defineAction() client stub: nu s-a putut determina numele acțiunii'
            )
        })

        it('marks the proxy with _isAction and _actionName', () => {
            const action = clientDefineAction('myAction')
            expect(action._isAction).toBe(true)
            expect(action._actionName).toBe('myAction')
        })
    })

    // ─── createActionProxy ────────────────────────────────────────────────────

    describe('createActionProxy', () => {
        it('creates a fetch proxy with default baseUrl', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: 'result' })
            })

            const action = createActionProxy('testAction')
            const result = await action('arg1', 'arg2')

            expect(global.fetch).toHaveBeenCalledWith(
                '/__fusee/actions/testAction',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ args: ['arg1', 'arg2'] })
                })
            )
            expect(result).toBe('result')
        })

        it('creates a fetch proxy with custom baseUrl', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: 123 })
            })

            const action = createActionProxy('testAction', { baseUrl: '/api/actions' })
            await action()

            expect(global.fetch).toHaveBeenCalledWith(
                '/api/actions/testAction',
                expect.any(Object)
            )
        })

        it('merges custom headers', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: null })
            })

            const action = createActionProxy('testAction', {
                headers: { 'X-CSRF-Token': 'abc123' }
            })
            await action()

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': 'abc123'
                    })
                })
            )
        })

        it('throws on non-ok response with error from server', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Bad input', code: 'VALIDATION_ERROR' })
            })

            const action = createActionProxy('testAction')
            await expect(action('bad')).rejects.toMatchObject({
                message: 'Bad input',
                status: 400,
                code: 'VALIDATION_ERROR'
            })
        })

        it('throws generic error when server returns no error message', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({})
            })

            const action = createActionProxy('testAction')
            await expect(action()).rejects.toMatchObject({
                message: 'Action "testAction" failed (500)',
                status: 500
            })
        })

        it('marks the proxy with _isAction and _actionName', () => {
            const action = createActionProxy('myAction')
            expect(action._isAction).toBe(true)
            expect(action._actionName).toBe('myAction')
        })
    })

    // ─── useAction ────────────────────────────────────────────────────────────

    describe('useAction', () => {
        it('throws if action is not a function', () => {
            expect(() => clientUseAction('not-a-function')).toThrow(
                '[fusee] useAction() requires an action function (result of defineAction or createActionProxy)'
            )
        })

        it('returns execute, pending, data, error, reset', () => {
            const action = createActionProxy('test')
            const result = clientUseAction(action)
            expect(result).toHaveProperty('execute')
            expect(result).toHaveProperty('pending')
            expect(result).toHaveProperty('data')
            expect(result).toHaveProperty('error')
            expect(result).toHaveProperty('reset')
        })

        it('pending starts as false', () => {
            const action = createActionProxy('test')
            const { pending } = clientUseAction(action)
            expect(pending()).toBe(false)
        })

        it('data starts as undefined', () => {
            const action = createActionProxy('test')
            const { data } = clientUseAction(action)
            expect(data()).toBeUndefined()
        })

        it('error starts as undefined', () => {
            const action = createActionProxy('test')
            const { error } = clientUseAction(action)
            expect(error()).toBeUndefined()
        })

        it('execute sets pending to true during call', async () => {
            let resolveFetch
            global.fetch = vi.fn(() => new Promise((res) => { resolveFetch = res }))

            const action = createActionProxy('slowAction')
            const { execute, pending } = clientUseAction(action)

            const promise = execute()
            expect(pending()).toBe(true)

            resolveFetch({
                ok: true,
                json: async () => ({ data: 'done' })
            })

            await promise
            expect(pending()).toBe(false)
        })

        it('execute sets data on success', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { id: 1, name: 'Ion' } })
            })

            const action = createActionProxy('createUser')
            const { execute, data } = clientUseAction(action)
            await execute({ name: 'Ion' })

            expect(data()).toEqual({ id: 1, name: 'Ion' })
        })

        it('execute sets error signal on failure (does not throw)', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Server error' })
            })

            const action = createActionProxy('failAction')
            const { execute, error } = clientUseAction(action)

            // useAction catches errors internally and sets the error signal
            const result = await execute()
            expect(result).toBeUndefined()
            expect(error()).toBeInstanceOf(Error)
            expect(error().message).toBe('Server error')
        })

        it('calls onSuccess callback with result', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: 'success' })
            })

            const action = createActionProxy('test')
            const onSuccess = vi.fn()
            const { execute } = clientUseAction(action, { onSuccess })

            await execute()
            expect(onSuccess).toHaveBeenCalledWith('success')
        })

        it('calls onError callback with error', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Bad request' })
            })

            const action = createActionProxy('test')
            const onError = vi.fn()
            const { execute } = clientUseAction(action, { onError })

            await execute()
            expect(onError).toHaveBeenCalledWith(expect.any(Error))
        })

        it('reset clears pending, data, and error', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: 'result' })
            })

            const action = createActionProxy('test')
            const { execute, pending, data, error, reset } = clientUseAction(action)

            await execute()
            expect(pending()).toBe(false)
            expect(data()).toBe('result')

            reset()
            expect(pending()).toBe(false)
            expect(data()).toBeUndefined()
            expect(error()).toBeUndefined()
        })

        it('concurrent calls: only the last call updates state', async () => {
            let resolveFirst, resolveSecond
            global.fetch = vi.fn()
                .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res }))
                .mockImplementationOnce(() => new Promise((res) => { resolveSecond = res }))

            const action = createActionProxy('concurrent')
            const { execute, data, pending } = clientUseAction(action)

            const p1 = execute('first')
            const p2 = execute('second')

            // Resolve first call
            resolveFirst({
                ok: true,
                json: async () => ({ data: 'first-result' })
            })
            await p1

            // Resolve second call
            resolveSecond({
                ok: true,
                json: async () => ({ data: 'second-result' })
            })
            await p2

            // Only the second result should be in data
            expect(data()).toBe('second-result')
        })

        it('resetOnCall=false keeps previous data on new call', async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ data: 'first' })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ data: 'second' })
                })

            const action = createActionProxy('test')
            const { execute, data } = clientUseAction(action, { resetOnCall: false })

            await execute()
            expect(data()).toBe('first')

            await execute()
            expect(data()).toBe('second')
        })

        it('console.error is called when onError is not provided and action fails', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'fail' })
            })

            const action = createActionProxy('test')
            const { execute } = clientUseAction(action)

            await execute()
            expect(consoleSpy).toHaveBeenCalled()

            consoleSpy.mockRestore()
        })
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE TESTS (actions.server.js)
// ═══════════════════════════════════════════════════════════════════════════════

describe('server actions (actions.server.js)', () => {

    // ─── defineAction ─────────────────────────────────────────────────────────

    describe('defineAction', () => {
        it('returns a function with _isAction and _actionName set correctly', () => {
            const name = uniqueName('reg')
            const fn = async (input) => ({ id: 1, ...input })
            const action = serverDefineAction(fn, { name })

            expect(typeof action).toBe('function')
            expect(action._isAction).toBe(true)
            expect(action._actionName).toBe(name)
        })

        it('uses opts.name as the action name', () => {
            const name = uniqueName('explicit')
            const action = serverDefineAction(async () => 'ok', { name })

            expect(action._actionName).toBe(name)
        })

        it('throws if first argument is not a function', () => {
            expect(() => serverDefineAction('not-a-function')).toThrow(
                '[fusee] defineAction() requires a function'
            )
            expect(() => serverDefineAction(42)).toThrow(
                '[fusee] defineAction() requires a function'
            )
            expect(() => serverDefineAction(null)).toThrow(
                '[fusee] defineAction() requires a function'
            )
        })

        it('throws when opts.name is an empty string', () => {
            expect(() => serverDefineAction(async () => {}, { name: '' })).toThrow(
                '[fusee] defineAction(): funcția trebuie să aibă un nume sau să specifici opts.name'
            )
        })

        it('registers the action in the registry (visible via getRegisteredActions)', () => {
            const nameA = uniqueName('alpha')
            const nameB = uniqueName('beta')
            serverDefineAction(async function a() {}, { name: nameA })
            serverDefineAction(async function b() {}, { name: nameB })

            const registered = getRegisteredActions()
            expect(registered).toContain(nameA)
            expect(registered).toContain(nameB)
        })

        it('the returned function executes fn with the received arguments', async () => {
            const fn = vi.fn(async (a, b) => a + b)
            const action = serverDefineAction(fn, { name: uniqueName('exec') })

            const result = await action(3, 4)

            expect(fn).toHaveBeenCalledWith(3, 4)
            expect(result).toBe(7)
        })

        it('calls opts.authorize before fn', async () => {
            const calls = []
            const authorize = vi.fn(async (input) => { calls.push('authorize') })
            const fn = vi.fn(async (input) => { calls.push('fn'); return 'ok' })

            const action = serverDefineAction(fn, { name: uniqueName('auth-order'), authorize })
            await action({ data: 'x' })

            expect(calls).toEqual(['authorize', 'fn'])
            expect(authorize).toHaveBeenCalledWith({ data: 'x' })
            expect(fn).toHaveBeenCalledWith({ data: 'x' })
        })

        it('throws from wrapped if authorize throws (fn is not called)', async () => {
            const authorize = vi.fn(async () => { throw new Error('Unauthorized') })
            const fn = vi.fn(async () => 'secret')

            const action = serverDefineAction(fn, { name: uniqueName('auth-fail'), authorize })

            await expect(action({ secret: 'wrong' })).rejects.toThrow('Unauthorized')
            expect(fn).not.toHaveBeenCalled()
        })

        it('overwrites an action with the same name (last-write-wins)', () => {
            const name = uniqueName('overwrite')
            serverDefineAction(async () => 'v1', { name })
            const v2 = serverDefineAction(async () => 'v2', { name })

            // The one registered last should be the active one
            expect(v2._actionName).toBe(name)
            const registered = getRegisteredActions()
            expect(registered.filter(n => n === name)).toHaveLength(1)
        })
    })

    // ─── handleActionRequest ──────────────────────────────────────────────────

    describe('handleActionRequest', () => {

        it('returns 404 when action is not found', async () => {
            const name = uniqueName('nonexistent')
            const req = createMockReq({ name })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(res.status).toHaveBeenCalledWith(404)
            expect(res.json).toHaveBeenCalledWith({
                error: `Action "${name}" not found`
            })
        })

        it('returns 400 when req.body getter throws', async () => {
            // Register a valid action to pass the 404 check
            const name = uniqueName('bad-body')
            serverDefineAction(async () => 'ok', { name })

            const badReq = {
                params: { name },
                get body() { throw new Error('Broken body') },
                url: `http://localhost/__fusee/actions/${name}`
            }
            const res = createMockRes()

            await handleActionRequest(badReq, res)

            expect(res.status).toHaveBeenCalledWith(400)
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid JSON body' })
        })

        it('executes action with args from body.args and returns 200', async () => {
            const name = uniqueName('greet')
            const fn = vi.fn(async (n) => ({ greeting: `Hello, ${n}!` }))
            serverDefineAction(fn, { name })

            const req = createMockReq({ name }, { args: ['World'] })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(fn).toHaveBeenCalledWith('World')
            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith({
                data: { greeting: 'Hello, World!' }
            })
        })

        it('passes entire body as single argument when body has no .args array', async () => {
            const name = uniqueName('echo')
            const fn = vi.fn(async (input) => ({ received: input }))
            serverDefineAction(fn, { name })

            const req = createMockReq({ name }, { name: 'Ion', age: 30 })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(fn).toHaveBeenCalledWith({ name: 'Ion', age: 30 })
            expect(res.status).toHaveBeenCalledWith(200)
        })

        it('calls fn with no arguments when body is empty (args: [])', async () => {
            const name = uniqueName('no-args')
            const fn = vi.fn(async () => 'no-args-result')
            serverDefineAction(fn, { name })

            const req = createMockReq({ name }, { args: [] })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(fn).toHaveBeenCalledWith()
            expect(res.status).toHaveBeenCalledWith(200)
        })

        it('returns 500 with generic message for internal errors (unexposed)', async () => {
            const name = uniqueName('internal-err')
            serverDefineAction(async () => { throw new Error('DB is down') }, { name })

            const req = createMockReq({ name }, { args: [] })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(res.status).toHaveBeenCalledWith(500)
            expect(res.json).toHaveBeenCalledWith({
                error: 'Internal server error',
                code: undefined
            })
        })

        it('exposes error message when err.expose === true', async () => {
            const name = uniqueName('exposed-err')
            serverDefineAction(async () => {
                const err = new Error('Missing field: email')
                err.expose = true
                err.status = 422
                err.code = 'VALIDATION_ERROR'
                throw err
            }, { name })

            const req = createMockReq({ name }, { args: [] })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(res.status).toHaveBeenCalledWith(422)
            expect(res.json).toHaveBeenCalledWith({
                error: 'Missing field: email',
                code: 'VALIDATION_ERROR'
            })
        })

        it('extracts action name from URL when req.params is missing', async () => {
            const name = uniqueName('url-action')
            const fn = vi.fn(async () => 'from-url')
            serverDefineAction(fn, { name })

            const req = {
                // no .params — simulates a standard Request (Fetch API / Hono)
                body: { args: [] },
                url: `http://localhost/__fusee/actions/${name}`
            }
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(fn).toHaveBeenCalled()
            expect(res.status).toHaveBeenCalledWith(200)
        })

        it('returns data: null when action returns undefined', async () => {
            const name = uniqueName('void-action')
            serverDefineAction(async () => undefined, { name })

            const req = createMockReq({ name }, { args: [] })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(res.status).toHaveBeenCalledWith(200)
            expect(res.json).toHaveBeenCalledWith({ data: null })
        })

        it('supports multiple arguments via body.args', async () => {
            const name = uniqueName('multi-args')
            const fn = vi.fn(async (a, b, c) => a + b + c)
            serverDefineAction(fn, { name })

            const req = createMockReq({ name }, { args: [1, 2, 3] })
            const res = createMockRes()

            await handleActionRequest(req, res)

            expect(fn).toHaveBeenCalledWith(1, 2, 3)
            expect(res.json).toHaveBeenCalledWith({ data: 6 })
        })
    })

    // ─── getRegisteredActions ─────────────────────────────────────────────────

    describe('getRegisteredActions', () => {
        it('returns an array', () => {
            expect(Array.isArray(getRegisteredActions())).toBe(true)
        })

        it('contains the registered actions', () => {
            const nameA = uniqueName('list-a')
            const nameB = uniqueName('list-b')
            serverDefineAction(async function x() {}, { name: nameA })
            serverDefineAction(async function y() {}, { name: nameB })

            const names = getRegisteredActions()
            expect(names).toContain(nameA)
            expect(names).toContain(nameB)
        })

        it('returns a copy — mutating it does not affect the internal registry', () => {
            const before = getRegisteredActions().length
            const copy = getRegisteredActions()
            copy.push('__fake_action__')

            expect(getRegisteredActions().length).toBe(before)
        })
    })
})
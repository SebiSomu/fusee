import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let wasm = null

let cachedUint8Mem = null
function getUint8Mem() {
    if (!cachedUint8Mem || cachedUint8Mem.byteLength === 0)
        cachedUint8Mem = new Uint8Array(wasm.memory.buffer)
    return cachedUint8Mem
}

const encoder = new TextEncoder()
let WASM_LEN = 0

function passStr(str, malloc, realloc) {
    if (!realloc) {
        const buf = encoder.encode(str)
        const ptr = malloc(buf.length, 1) >>> 0
        getUint8Mem().subarray(ptr, ptr + buf.length).set(buf)
        WASM_LEN = buf.length
        return ptr
    }
    let len = str.length
    let ptr = malloc(len, 1) >>> 0
    const mem = getUint8Mem()
    let offset = 0
    for (; offset < len; offset++) {
        const code = str.charCodeAt(offset)
        if (code > 0x7F) break
        mem[ptr + offset] = code
    }
    if (offset !== len) {
        if (offset !== 0) str = str.slice(offset)
        ptr = realloc(ptr, len, len = offset + str.length * 3, 1) >>> 0
        const view = getUint8Mem().subarray(ptr + offset, ptr + len)
        const ret = encoder.encodeInto(str, view)
        offset += ret.written
        ptr = realloc(ptr, len, offset, 1) >>> 0
    }
    WASM_LEN = offset
    return ptr
}

let numBytesDecoded = 0
let decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
decoder.decode()

function getStr(ptr, len) {
    numBytesDecoded += len
    if (numBytesDecoded >= 2146435072) {
        decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
        decoder.decode()
        numBytesDecoded = len
    }
    return decoder.decode(getUint8Mem().subarray(ptr, ptr + len))
}

function takeExternref(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx)
    wasm.__externref_table_dealloc(idx)
    return value
}

const wasmPath = resolve(__dirname, '../rust-compiler/pkg/fusee_compiler_bg.wasm')

let _initialized = false
async function _init() {
    if (_initialized) return
    _initialized = true

    const wasmBytes = readFileSync(wasmPath)

    const imports = {
        './fusee_compiler_bg.js': {
            __wbg_alert_f3c04f14b1e59052: (ptr, len) => {
                console.log('[wasm alert]', getStr(ptr, len))
            },
            __wbindgen_generic_0000000000000001: (ptr, len) => {
                return getStr(ptr, len)
            },
            __wbindgen_init_externref_table: () => {
                const table = wasm.__wbindgen_externrefs
                const offset = table.grow(4)
                table.set(0, undefined)
                table.set(offset + 0, undefined)
                table.set(offset + 1, null)
                table.set(offset + 2, true)
                table.set(offset + 3, false)
            },
        }
    }

    const { instance } = await WebAssembly.instantiate(wasmBytes, imports)
    wasm = instance.exports
    wasm.__wbindgen_start?.()
}

await _init()

export function compile(source, options = {}) {
    const optJson = JSON.stringify({
        filename: options.filename ?? '<template>',
        runtimePath: options.runtimePath ?? null,
        ssrRuntimePath: options.ssrRuntimePath ?? null,
        components: options.components ?? [],
        scope: options.scope ?? [],
        throwOnWarning: options.throwOnWarning ?? false,
        target: options.target ?? 'client',
    })

    let deferred0, deferred1
    try {
        const ptr0 = passStr(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
        const len0 = WASM_LEN
        const ptr1 = passStr(optJson, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc)
        const len1 = WASM_LEN

        const ret = wasm.compile(ptr0, len0, ptr1, len1)
        let ptr3 = ret[0]
        let len3 = ret[1]

        if (ret[3]) {
            ptr3 = 0; len3 = 0
            throw takeExternref(ret[2])
        }

        deferred0 = ptr3
        deferred1 = len3
        const resultJson = getStr(ptr3, len3)
        return JSON.parse(resultJson)
    } catch (err) {
        throw new Error(`[fusee:rust-compiler] ${err?.message ?? String(err)}`)
    } finally {
        if (deferred0 !== undefined) wasm.__wbindgen_free(deferred0, deferred1, 1)
    }
}

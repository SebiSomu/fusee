// Loader pentru compilatorul Rust+WASM (framework/core/rust-compiler).
// Expune aceeași semnătură `compile(source, options)` ca `main-compiler.js`,
// dar execută implementarea Rust (mai rapidă) în locul celei JS.
//
// WASM-ul este încărcat lazy (doar la prima compilare) și pornit cu `init()`.
// Pentru a genera `pkg/`, rulează: `npm run build:rust`
// (necesită `rustup target add wasm32-unknown-unknown` și `wasm-pack`).

let wasmReady = null;

async function ensureWasm() {
    if (!wasmReady) {
        wasmReady = (async () => {
            let pkg;
            try {
                pkg = await import('../../rust-compiler/pkg/fusee_compiler.js');
            } catch (err) {
                throw new Error(
                    '[fusée] Rust compiler WASM not found. Run `npm run build:rust` first.\n' +
                    `  (${err.message})`
                );
            }
            // wasm-pack --target web exportă `init` ca default export.
            await pkg.default();
            return pkg;
        })();
    }
    return wasmReady;
}

/**
 * Compilează un șablon Fusée folosind implementarea Rust+WASM.
 * @param {string} source  sursa șablonului (.fusee / .fhtml / .template.html)
 * @param {object} [options]  { filename, components, scope, runtimePath, throwOnWarning }
 * @returns {Promise<{ code: string, warnings: Array }>}
 */
export async function compile(source, options = {}) {
    const pkg = await ensureWasm();
    const json = pkg.compile(source, JSON.stringify(options ?? {}));
    const result = JSON.parse(json);
    return {
        code: result.code,
        warnings: result.warnings ?? [],
    };
}

export default { compile };

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function findPkg() {
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
        const candidate = path.join(dir, 'framework', 'core', 'rust-compiler', 'pkg', 'fusee_compiler.js');
        if (fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return path.resolve(process.cwd(), 'framework', 'core', 'rust-compiler', 'pkg', 'fusee_compiler.js');
}

let wasmReady = null;

async function ensureWasm() {
    if (!wasmReady) {
        wasmReady = (async () => {
            const pkgPath = findPkg();
            const pkgDir = path.dirname(pkgPath);
            const wasmPath = path.join(pkgDir, 'fusee_compiler_bg.wasm');
            let pkg;
            try {
                pkg = await import(/* @vite-ignore */ pathToFileURL(pkgPath).href);
            } catch (err) {
                throw new Error(
                    '[fusée] Rust compiler WASM not found at:\n  ' +
                        pkgPath +
                        '\nRun `npm run build:rust` first (from the project root).\n' +
                        `  (${err.message})`
                );
            }
            const wasmBuffer = fs.readFileSync(wasmPath);
            pkg.initSync(wasmBuffer);
            return pkg;
        })();
    }
    return wasmReady;
}

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

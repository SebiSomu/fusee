import { compile as jsCompile } from '../main-compiler.js';
import fs from 'node:fs';
import path from 'node:path';

// Când e setat, folosește implementarea Rust+WASM în locul celei JS.
// Build-time: `FUSEE_RUST_COMPILER=1 npm run build` (după `npm run build:rust`).
const USE_RUST =
    process.env.FUSEE_RUST_COMPILER === '1' ||
    process.env.FUSEE_RUST_COMPILER === 'true';

const IMPORT_RE = /^import\s+(?:\{[^}]*\}|[\w$]+)\s+from\s+['"]([^'"]+\.template\.html)['"]\s*;?/gm;

export function fuseeCompilerPlugin() {
    return {
        name: 'vite-plugin-fusee-compiler',
        enforce: 'pre',

        async transform(code, id) {
            if (!id.endsWith('.js') && !id.endsWith('.ts')) 
                return null;
            if (!IMPORT_RE.test(code)) 
                return null;

            IMPORT_RE.lastIndex = 0;

            let result = code;
            let match;

            while ((match = IMPORT_RE.exec(code)) !== null) {
                const [fullImport, templatePath] = match;
                const absPath = path.resolve(path.dirname(id), templatePath);
                const source = fs.readFileSync(absPath, 'utf-8');

                const opts = { runtimePath: 'fusee-framework/core/h.js' };
                const { code: compiledCode } = USE_RUST
                    ? await (await import('../rust-compiler.js')).compile(source, opts)
                    : jsCompile(source, opts);

                const namedMatch = fullImport.match(/\{\s*render\s+as\s+([\w$]+)\s*\}/);
                const defaultMatch = fullImport.match(/import\s+([\w$]+)\s+from/);
                const localName = namedMatch ? namedMatch[1] : (defaultMatch ? defaultMatch[1] : 'render');
                const inlined = compiledCode.replace(
                    'export function render(',
                    `function ${localName}(`
                );

                result = result.replace(fullImport, inlined);
            }

            return { code: result, map: null };
        }
    };
}

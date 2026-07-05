import { compile, compileModule } from '../core/compiler/main-compiler.js';
import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE = /^import\s+(?:\{[^}]*\}|[\w$]+)\s+from\s+['"]([^'"]+\.template\.html)['"]\s*;?/gm;

export function fuseeCompilerPlugin() {
    return {
        name: 'vite-plugin-fusee-compiler',
        enforce: 'pre',

        transform(code, id) {
            if (!id.endsWith('.js') && !id.endsWith('.ts')) return null;
            if (id.includes('node_modules')) return null;

            let result = code;
            let map = null;

            if (IMPORT_RE.test(code)) {
                IMPORT_RE.lastIndex = 0;

                let match;

                while ((match = IMPORT_RE.exec(code)) !== null) {
                    const [fullImport, templatePath] = match;
                    const absPath = path.resolve(path.dirname(id), templatePath);
                    const source = fs.readFileSync(absPath, 'utf-8');
                    const { code: compiledCode } = compile(source, {
                        runtimePath: 'fusee-framework/core/h.js'
                    });

                    const namedMatch = fullImport.match(/\{\s*render\s+as\s+([\w$]+)\s*\}/);
                    const defaultMatch = fullImport.match(/import\s+([\w$]+)\s+from/);
                    const localName = namedMatch ? namedMatch[1] : (defaultMatch ? defaultMatch[1] : 'render');

                    const inlined = compiledCode.replace(
                        'export function render(',
                        `function ${localName}(`
                    );

                    result = result.replace(fullImport, inlined);
                }
            }

            try {
                const runeResult = compileModule(result, { filename: id });
                result = runeResult.code;
                map = runeResult.map;
            } catch (err) {
                console.warn(`[fusee] Skipping rune compilation for ${id}: ${err.message}`);
            }

            return { code: result, map };
        }
    };
}

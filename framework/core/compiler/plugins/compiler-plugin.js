import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../main-compiler.js';

const VIRTUAL_QUERY = '?fusee-template';
const RUNTIME_PATH = 'fusee/runtime/h.js';

function isTemplateId(id) {
    return id.endsWith('.template.html' + VIRTUAL_QUERY) || id.endsWith('.template.html');
}

function toRealId(id) {
    return id.endsWith(VIRTUAL_QUERY) ? id.slice(0, -VIRTUAL_QUERY.length) : id;
}

export function fuseeCompilerPlugin() {
    return {
        name: 'vite-plugin-fusee-compiler',
        enforce: 'pre',

        resolveId(id, importer) {
            if (id.endsWith('.template.html')) {
                const resolved = importer
                    ? path.resolve(path.dirname(importer), id)
                    : path.resolve(id);
                // Return a virtual .js module id so Vite treats the emitted
                // code as JavaScript and never runs HTML handling on it.
                return resolved + VIRTUAL_QUERY;
            }
            return null;
        },

        load(id) {
            if (isTemplateId(id)) {
                const realId = toRealId(id);
                console.log('[fusee-compiler] transforming:', realId);
                const source = fs.readFileSync(realId, 'utf8');

                const { code, warnings } = compile(source, {
                    filename: realId,
                    runtimePath: RUNTIME_PATH,
                });

                for (const w of warnings ?? []) {
                    const msg = typeof w.format === 'function' ? w.format(realId) : (w.message ?? String(w));
                    console.warn('[fusee-compiler] warning:', msg);
                }

                console.log('[fusee-compiler] transformed code length:', code.length);
                return { code, map: null };
            }
            return null;
        }
    };
}

import fs from 'node:fs';
import path from 'node:path';

export function fuseeCompilerPlugin() {
    return {
        name: 'vite-plugin-fusee-compiler',
        enforce: 'pre',

        load(id) {
            if (id.endsWith('.template.html')) {
                const source = fs.readFileSync(id, 'utf8');
                const escapedSource = source
                    .replace(/`/g, '\\`')
                    .replace(/\$/g, '\\$');
                return `
import { mountTemplate } from 'fusee-framework';

export function render(ctx, components, container) {
    return mountTemplate(\`${escapedSource}\`, container, ctx, components);
}
`;
            }
        }
    };
}

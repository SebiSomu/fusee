#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceFramework = path.join(__dirname, '..');

const projectName = process.argv[2] || 'my-fusee-app';
const projectPath = path.join(process.cwd(), projectName);

console.log(`🚀 Scaffolding a full Fusée project in: ${projectPath}...`);

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(item => {
        const s = path.join(src, item);
        const d = path.join(dest, item);
        if (fs.lstatSync(s).isDirectory()) {
            if (item !== 'bin' && item !== 'node_modules') copyDir(s, d);
        } else fs.copyFileSync(s, d);
    });
}

const coreFolders = ['app', 'app/components'];
coreFolders.forEach(f => {
    const dir = path.join(projectPath, f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log('📦 Injecting Fusée Core Engine...');
copyDir(sourceFramework, path.join(projectPath, 'framework'));

const packageJson = {
    name: projectName,
    version: '1.0.0',
    type: 'module',
    scripts: { "dev": "vite" },
    devDependencies: { "vite": "^5.0.0" }
};
fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

const indexHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Hello Fusée!</title>
    <style>
        body { background: #050505; color: white; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        #app { text-align: center; background: #111; padding: 3rem; border-radius: 20px; border: 1px solid #222; box-shadow: 0 10px 40px rgba(255, 51, 51, 0.1); }
        h1 { color: #ff3333; text-shadow: 0 0 20px rgba(255, 51, 51, 0.3); }
    </style>
</head>
<body>
    <div id="app">
        <h1>Fusée 🚀</h1>
        <p style="color: #ff9999; opacity: 0.8;">A reactive framework built with passion.</p>
        {{ Counter }}
    </div>
    <script type="module" src="/app/main.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(projectPath, 'index.html'), indexHtml);

// THE REAL COUNTER COMPONENT (NOW IN RED)
const counterJs = `
import { signal } from '../../framework/core/signal.js';
import { mountTemplate } from '../../framework/core/compiler.js';

export function Counter(props) {
    const count = signal(0);
    
    return {
        render(container) {
            const template = \`
                <div style="margin-top: 2rem;">
                    <button @click="inc" style="font-size: 1.5rem; background: #ff3333; color: white; border: none; padding: 0.5rem 1.5rem; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 15px rgba(255, 51, 51, 0.3);">
                        Count: {{ count }}
                    </button>
                    <p style="opacity: 0.6; margin-top: 1rem; color: #ff9999;">Click to see reactivity in action!</p>
                </div>
            \`;
            
            const context = {
                count,
                inc: () => count(count() + 1)
            };
            
            mountTemplate(template, container, context, {});
        }
    };
}
`;
fs.writeFileSync(path.join(projectPath, 'app/components/Counter.js'), counterJs);

const mainJs = `
import { mountTemplate } from '../framework/core/compiler.js';
import { Counter } from './components/Counter.js';

const root = document.getElementById('app');
if (root) {
    mountTemplate(root.innerHTML, root, {}, { Counter });
}
`;
fs.writeFileSync(path.join(projectPath, 'app/main.js'), mainJs);

console.log('✅ Red Theme Template Ready! Run create-fusee again to see it in action.');

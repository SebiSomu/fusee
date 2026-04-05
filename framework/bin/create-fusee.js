#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find the package root (where package.json lives) to make paths resilient
let pkgRoot = __dirname;
while (pkgRoot !== path.dirname(pkgRoot) && !fs.existsSync(path.join(pkgRoot, 'package.json'))) {
    pkgRoot = path.dirname(pkgRoot);
}

const sourceFramework = fs.existsSync(path.join(pkgRoot, 'framework'))
    ? path.join(pkgRoot, 'framework')
    : pkgRoot;

const projectName = process.argv[2] || 'my-fusee-app';
const projectPath = path.isAbsolute(projectName) ? projectName : path.join(process.cwd(), projectName);

async function scaffold() {
    console.log(`\n🚀 Welcome to Fusée Framework Scaffolder!`);
    const choice = await new Promise(resolve => {
        rl.question('🧬 Select language template [JavaScript (js) / TypeScript (ts)] (default: js): ', (answer) => {
            resolve(answer.toLowerCase() === 'ts' ? 'ts' : 'js');
        });
    }); rl.close();

    console.log(`\n🚀 Scaffolding a new project in: ${projectPath}...`);

    function copyDir(src, dest, skipTypes = false) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(item => {
            // Sărim folderul types SAU orice fișier .d.ts rătăcit
            if (skipTypes && (item === 'types' || item.endsWith('.d.ts'))) return;
            if (item === 'bin' || item === 'node_modules' || item === '.git') return;

            const s = path.join(src, item);
            const d = path.join(dest, item);
            if (fs.lstatSync(s).isDirectory()) copyDir(s, d, skipTypes);
            else fs.copyFileSync(s, d);
        });
    }

    const coreFolders = ['app', 'app/components'];
    coreFolders.forEach(f => {
        const dir = path.join(projectPath, f);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    console.log('📦 Injecting Fusée Core Engine (Strict Mode)...');
    copyDir(sourceFramework, path.join(projectPath, 'framework'), choice === 'js');

    const packageJson = {
        name: projectName === '.' ? 'fusee-project' : projectName,
        version: '1.0.0',
        type: 'module',
        scripts: { "dev": "vite", "build": "vite build" },
        devDependencies: { "vite": "^5.0.0" }
    };
    if (choice === 'ts') packageJson.devDependencies["typescript"] = "^5.0.0";
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    if (choice === 'ts') {
        const tsConfig = { compilerOptions: { "target": "ESNext", "module": "ESNext", "moduleResolution": "node", "strict": true, "esModuleInterop": true, "skipLibCheck": true } };
        fs.writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
    }

    const ext = choice === 'ts' ? 'ts' : 'js';
    const indexHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Strict Fusée App</title>
    <style>
        body { background: #050505; color: white; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        #app { text-align: center; background: #111; padding: 3rem; border-radius: 20px; border: 1px solid #222; box-shadow: 0 10px 40px rgba(255, 51, 51, 0.1); }
        h1 { color: #ff3333; text-shadow: 0 0 20px rgba(255, 51, 51, 0.3); margin: 0; font-size: 2.5rem; }
    </style>
</head>
<body>
    <div id="app">
        <h1>Fusée 🚀</h1>
        <p style="color: #ff9999; opacity: 0.8; margin-bottom: 2rem;">A reactive framework built with passion.</p>
        {{ Counter }}
    </div>
    <script type="module" src="/app/main.${ext}"></script>
</body>
</html>
    `;
    fs.writeFileSync(path.join(projectPath, 'index.html'), indexHtml);

    const btnStyle = "background:#ff3333; color:white; border:none; width:45px; height:45px; border-radius:12px; cursor:pointer; font-size:1.6rem; font-weight:bold; transition: 0.3s; box-shadow: 0 4px 15px rgba(255, 51, 51, 0.2);";
    const counterContent = choice === 'ts'
        ? `import { signal } from '../../framework/core/signal.js';
import { defineComponent } from '../../framework/core/component.js';

export const Counter = defineComponent({
    setup() {
        const count = signal<number>(0);
        return {
            count,
            inc: () => count(count() + 1),
            dec: () => count(count() - 1),
            template: \`
                <div style="display:flex; align-items:center; justify-content:center; gap:2.5rem;">
                    <button @click="dec" style="${btnStyle}">-</button>
                    <span style="font-size:2.8rem; font-weight:bold; min-width:70px;">{{ count }}</span>
                    <button @click="inc" style="${btnStyle}">+</button>
                </div>
            \`
        };
    }
});`
        : `import { signal } from '../../framework/core/signal.js';
import { defineComponent } from '../../framework/core/component.js';

export const Counter = defineComponent({
    setup() {
        const count = signal(0);
        return {
            count,
            inc: () => count(count() + 1),
            dec: () => count(count() - 1),
            template: \`
                <div style="display:flex; align-items:center; justify-content:center; gap:2.5rem;">
                    <button @click="dec" style="${btnStyle}">-</button>
                    <span style="font-size:2.8rem; font-weight:bold; min-width:70px;">{{ count }}</span>
                    <button @click="inc" style="${btnStyle}">+</button>
                </div>
            \`
        };
    }
});`;

    fs.writeFileSync(path.join(projectPath, `app/components/Counter.${ext}`), counterContent);

    const mainContent = `import { mountTemplate } from '../framework/core/compiler.js';
import { Counter } from './components/Counter';

const root = document.getElementById('app');
if (root) {
    mountTemplate(root.innerHTML, root, {}, { Counter });
}
`;
    fs.writeFileSync(path.join(projectPath, `app/main.${ext}`), mainContent);

    console.log(`\n✅ Fusée Project Ready!`);
    const instructions = projectName === '.' ? 'npm install && npm run dev' : `cd ${projectName} && npm install && npm run dev`;
    console.log(`👉 Run: ${instructions}\n`);
}

scaffold();

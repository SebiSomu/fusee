#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find the package root
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
            if (skipTypes && (item === 'types' || item.endsWith('.d.ts'))) return;
            if (item === 'bin' || item === 'node_modules' || item === '.git' || item === 'dist') return;

            const s = path.join(src, item);
            const d = path.join(dest, item);
            if (fs.lstatSync(s).isDirectory()) copyDir(s, d, skipTypes);
            else fs.copyFileSync(s, d);
        });
    }

    const coreFolders = ['app', 'app/components', 'app/routes'];
    coreFolders.forEach(f => {
        const dir = path.join(projectPath, f);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    console.log('📦 Injecting Fusée Core Engine...');
    copyDir(sourceFramework, path.join(projectPath, 'framework'), choice === 'js');

    const ext = choice === 'ts' ? 'ts' : 'js';

    // 1. package.json
    const packageJson = {
        name: projectName === '.' ? 'fusee-project' : projectName,
        version: '1.0.0',
        type: 'module',
        scripts: { "dev": "vite", "build": "vite build" },
        devDependencies: {
            "vite": "^5.0.0",
            "unplugin-auto-import": "^0.17.0"
        }
    };
    if (choice === 'ts') packageJson.devDependencies["typescript"] = "^5.0.0";
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // 2. vite.config.js
    const viteConfig = `import { defineConfig } from 'vite';
import path from 'path';
import AutoImport from 'unplugin-auto-import/vite';
import { FuseePreset } from './framework/auto-import-preset.js';

export default defineConfig({
  resolve: {
    alias: {
      'fusee-framework': path.resolve(__dirname, './framework')
    }
  },
  plugins: [
    AutoImport({
      imports: [FuseePreset],
      dts: true // Generates auto-imports.d.ts
    })
  ]
});`;
    fs.writeFileSync(path.join(projectPath, 'vite.config.js'), viteConfig);

    // 3. tsconfig.json (if TS)
    if (choice === 'ts') {
        const tsConfig = {
            compilerOptions: {
                "target": "ESNext",
                "module": "ESNext",
                "moduleResolution": "bundler",
                "strict": true,
                "esModuleInterop": true,
                "skipLibCheck": true,
                "paths": {
                    "fusee-framework": ["./framework/types/index.d.ts"]
                }
            },
            "include": ["app/**/*", "framework/**/*", "auto-imports.d.ts"]
        };
        fs.writeFileSync(path.join(projectPath, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
    }

    // 4. index.html
    const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Fusée App</title>
    <style>
        body { background: #050505; color: white; font-family: system-ui; margin: 0; }
        #app { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .hero { text-align: center; margin-bottom: 2rem; }
        h1 { color: #ff3333; font-size: 3rem; margin: 0; }
    </style>
</head>
<body>
    <div id="app">
        <div class="hero">
            <h1>Fusée 🚀</h1>
            <p style="opacity: 0.6;">Modern Reactive Framework</p>
        </div>
        {{ Counter }}
    </div>
    <script type="module" src="/app/main.${ext}"></script>
</body>
</html>`;
    fs.writeFileSync(path.join(projectPath, 'index.html'), indexHtml);

    // 5. Counter component
    const btnStyle = "background:#ff3333; color:white; border:none; width:50px; height:50px; border-radius:15px; cursor:pointer; font-size:1.5rem; transition: 0.2s;";
    const counterContent = choice === 'ts'
        ? `import type { Signal } from 'fusee-framework'

interface CounterResult {
    count: Signal<number>
    inc: () => void
    dec: () => void
    template: string
}

export const Counter = defineComponent({
    setup(): CounterResult {
        const count = signal<number>(0);
        return {
            count,
            inc: () => count(count() + 1),
            dec: () => count(count() - 1),
            template: \`
                <div style="display:flex; align-items:center; gap:2rem; background:#111; padding:2rem; border-radius:20px; border:1px solid #222;">
                    <button @click="dec" style="${btnStyle}">-</button>
                    <span style="font-size:3rem; font-weight:bold; min-width:60px; text-align:center;">{{ count }}</span>
                    <button @click="inc" style="${btnStyle}">+</button>
                </div>
            \`
        };
    }
});`
        : `export const Counter = defineComponent({
    setup() {
        const count = signal(0);
        return {
            count,
            inc: () => count(count() + 1),
            dec: () => count(count() - 1),
            template: \`
                <div style="display:flex; align-items:center; gap:2rem; background:#111; padding:2rem; border-radius:20px; border:1px solid #222;">
                    <button @click="dec" style="${btnStyle}">-</button>
                    <span style="font-size:3rem; font-weight:bold; min-width:60px; text-align:center;">{{ count }}</span>
                    <button @click="inc" style="${btnStyle}">+</button>
                </div>
            \`
        };
    }
});`;
    fs.writeFileSync(path.join(projectPath, `app/components/Counter.${ext}`), counterContent);

    // 6. main.js
    const mainContent = `import { Counter } from './components/Counter';

const root = document.getElementById('app');
if (root) {
    // mountTemplate is now auto-imported via Fusée!
    mountTemplate(root.innerHTML, root, {}, { Counter });
}
`;
    fs.writeFileSync(path.join(projectPath, `app/main.${ext}`), mainContent);

    console.log(`\n✅ Fusée Project Ready!`);
    const instructions = projectName === '.' ? 'npm install && npm run dev' : `cd ${projectName} && npm install && npm run dev`;
    console.log(`👉 Run: ${instructions}\n`);
}

scaffold();

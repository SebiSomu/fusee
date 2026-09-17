import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = process.cwd();
const cwd = path.resolve(rootDir, 'create-fusee-go');

// Directories to EXCLUDE from the embed sync
const EXCLUDE = new Set(['bin', 'node_modules', '.git', 'dist', '__tests__', 'target', '.idea', '.cargo']);

/**
 * Recursively copy srcDir -> destDir, skipping EXCLUDE patterns.
 * Files named "go.mod" in subdirectories are stored as "go.mod.txt" to
 * avoid Go embed skipping nested Go modules (the root go.mod is skipped).
 */
function syncDir(src, dest, opts = {}) {
  const { skipGoMod = false } = opts;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const name = entry.name;
    if (EXCLUDE.has(name)) continue;

    const srcPath = path.join(src, name);
    const destName = (skipGoMod && name === 'go.mod') ? 'go.mod.txt' : name;
    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      syncDir(srcPath, destPath, { skipGoMod: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Sync framework
const frameworkSrc  = path.resolve(rootDir, 'framework');
const frameworkDest = path.resolve(cwd, 'internal/assets/embed/framework');

if (fs.existsSync(frameworkDest)) fs.rmSync(frameworkDest, { recursive: true, force: true });

function syncFramework(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const name = entry.name;
    if (EXCLUDE.has(name) || name === 'engine-go' || name === 'compiler-legacy' || name === 'server-legacy') continue;
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);
    if (entry.isDirectory()) {
      syncFramework(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
syncFramework(frameworkSrc, frameworkDest);

// Sync engine-go into its own embed directory
const engineSrc  = path.resolve(rootDir, 'framework/engine-go');
const engineDest = path.resolve(cwd, 'internal/assets/embed/engine-go');

if (fs.existsSync(engineDest)) fs.rmSync(engineDest, { recursive: true, force: true });
syncDir(engineSrc, engineDest, { skipGoMod: true });

// Cross-compile for all platforms
const targets = [
  { goos: 'windows', goarch: 'amd64', out: '../bin/create-fusee-win.exe' },
  { goos: 'linux',   goarch: 'amd64', out: '../bin/create-fusee-linux' },
  { goos: 'darwin',  goarch: 'arm64', out: '../bin/create-fusee-mac-arm64' },
  { goos: 'darwin',  goarch: 'amd64', out: '../bin/create-fusee-mac-intel' }
];

for (const t of targets) {
  console.log('Building for ' + t.goos + '/' + t.goarch + ' -> ' + t.out);
  execSync('go build -o ' + t.out + ' .', {
    cwd,
    env: { ...process.env, GOOS: t.goos, GOARCH: t.goarch },
    stdio: 'inherit'
  });
}

fs.copyFileSync(
  path.resolve(rootDir, 'bin/create-fusee-win.exe'),
  path.resolve(rootDir, 'bin/create-fusee.exe')
);

console.log('All CLI binaries compiled and synchronized successfully!');

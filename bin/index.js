#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBinaryName() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') return 'create-fusee-win.exe';
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'create-fusee-mac-arm64' : 'create-fusee-mac-intel';
  }
  if (platform === 'linux') return 'create-fusee-linux';
  
  return 'create-fusee-linux'; // Default fallback
}

const binName = getBinaryName();
const binPath = path.join(__dirname, binName);

// Fallback for local development if specific named binary isn't there
const finalPath = fs.existsSync(binPath) ? binPath : path.join(__dirname, 'create-fusee.exe');

if (!fs.existsSync(finalPath)) {
  console.error(`\n❌ Error: Fusée binary not found for your platform (${process.platform})`);
  process.exit(1)
}

const args = process.argv.slice(2);
const child = spawn(finalPath, args, { stdio: 'inherit' });

child.on('exit', (code) => {
  process.exit(code);
});

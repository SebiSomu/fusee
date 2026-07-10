import { defineConfig } from 'vite'
import { qwikVite } from '@builder.io/qwik/optimizer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root: __dirname,
    plugins: [
        qwikVite({
            csr: true,
        }),
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
    },
})

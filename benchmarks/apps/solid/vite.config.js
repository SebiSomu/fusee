import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root: __dirname,
    plugins: [solid()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
    },
})

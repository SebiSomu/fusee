import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root: __dirname,
    plugins: [vue()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
    },
})

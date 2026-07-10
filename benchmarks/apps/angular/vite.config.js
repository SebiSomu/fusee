import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    root: __dirname,
    resolve: {
        mainFields: ['module'],
    },
    plugins: [angular()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
    },
})

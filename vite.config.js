import { defineConfig } from 'vite'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import { FuseePreset } from './framework/auto-import-preset.js'

export default defineConfig({
    root: '.',
    plugins: [
        AutoImport({
            imports: [FuseePreset],
            dts: true,
        })
    ],

    resolve: {
        alias: {
            'fusee-framework': path.resolve(__dirname, './framework'),
            '@app': path.resolve(__dirname, './app'),
        }
    },

    server: {
        port: 3000,
        open: true,
        hmr: true,
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,

        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            }
        }
    },

    test: {
        environment: 'jsdom',
        globals: true,
        typecheck: {
            enabled: true,
            include: ['**/*.test-d.ts'],
        }
    }
})

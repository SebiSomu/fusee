import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
    root: '.',

    resolve: {
        alias: {
            '@fusee': path.resolve(__dirname, './framework'),
            '@app': path.resolve(__dirname, './app'),
        }
    },

    server: {
        port: 3000,
        open: true,        // Deschide browserul automat
        hmr: true,         // Hot Module Replacement
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,

        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            }
        }
    }
})

import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
    // Directorul rădăcină al proiectului
    root: '.',

    // Alias-uri pentru import-uri mai curate
    // În loc de '../../framework/index.js' poți scrie '@fusee'
    resolve: {
        alias: {
            '@fusee': path.resolve(__dirname, './framework'),
            '@app': path.resolve(__dirname, './app'),
        }
    },

    // Config pentru server-ul de development
    server: {
        port: 3000,
        open: true,        // Deschide browserul automat
        hmr: true,         // Hot Module Replacement
    },

    // Config pentru build de producție
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

import { defineConfig } from 'vite'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import { FuseePreset } from './framework/auto-import-preset.js'
import { fuseeCompilerPlugin } from './framework/core/compiler/plugins/compiler-plugin.js'

export default defineConfig({
    root: '.',
    plugins: [
        fuseeCompilerPlugin(),
        AutoImport({
            imports: [FuseePreset],
            dts: true,
        })
    ],

    resolve: {
        alias: [
            { find: 'fusee-framework/server', replacement: path.resolve(__dirname, './framework/server/index.js') },
            { find: 'fusee-framework/router', replacement: path.resolve(__dirname, './framework/router/index.js') },
            { find: 'fusee-framework/actions.server', replacement: path.resolve(__dirname, './framework/server/actions.js') },
            { find: /^fusee-framework\/core\/(.*)$/, replacement: path.resolve(__dirname, './framework/core/$1') },
            { find: /^fusee-framework\/(.*)$/, replacement: path.resolve(__dirname, './framework/$1') },
            { find: 'fusee-framework', replacement: path.resolve(__dirname, './framework/index.js') },
            { find: '@app', replacement: path.resolve(__dirname, './app') },
            { find: '@shared/config', replacement: path.resolve(__dirname, '../shared-config/index.ts') }
        ]
    },

    optimizeDeps: {
        exclude: ['fusee-framework']
    },

    server: {
        port: 3000,
        open: true,
        hmr: true,
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'esnext',

        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            },
            external: [
                /^node:/
            ]
        }
    },

    test: {
        environment: 'jsdom',
        globals: true,
        exclude: [
            'node_modules/**',
            'benchmarks/**',
            'fusee-benchmarks/**',
            'bench-node-1/**',
            'create-fusee-go/**',
            'dist/**'
        ],
        typecheck: {
            enabled: true,
            include: ['framework/**/*.test-d.ts'],
        },
        resolve: {
            alias: {
                'fusee/actions.server': path.resolve('./framework/server/actions.js')
            }
        }
    }
})

import { defineConfig, mergeConfig } from 'vite'
import viteConfig from './vite.config.js'

export default mergeConfig(
    viteConfig,
    defineConfig({
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
            ]
        }
    })
)
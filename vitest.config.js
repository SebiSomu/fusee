export default {
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
}
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const APPS_DIR = path.join(ROOT, 'apps')

export const FRAMEWORKS = [
    { id: 'fusee', name: 'Fusée', port: 4001 },
    { id: 'react', name: 'React', port: 4002 },
    { id: 'vue', name: 'Vue', port: 4003 },
    { id: 'svelte', name: 'Svelte', port: 4004 },
    { id: 'solid', name: 'Solid', port: 4005 },
    { id: 'preact', name: 'Preact', port: 4006 },
    { id: 'angular', name: 'Angular', port: 4007 },
    { id: 'qwik', name: 'Qwik', port: 4008 },
]

export const TESTS = [
    { id: 'create', label: 'Create 1,000 rows', rows: 1000 },
    { id: 'update', label: 'Update every 10th row', rows: 1000 },
    { id: 'swap', label: 'Swap 2 rows', rows: 1000 },
    { id: 'clear', label: 'Clear all rows', rows: 1000 },
]

export const DEFAULT_RUNS = 50
export const WARMUP_RUNS = 5

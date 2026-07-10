import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { FRAMEWORKS, APPS_DIR } from './config.mjs'

const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]?.split(',')
    : null

for (const fw of FRAMEWORKS) {
    if (only && !only.includes(fw.id)) continue

    const dir = path.join(APPS_DIR, fw.id)
    console.log(`\n🔨 Building ${fw.name}...`)

    const result = spawnSync('npm', ['run', 'build'], {
        cwd: dir,
        stdio: 'inherit',
        shell: true,
    })

    if (result.status !== 0) {
        console.error(`❌ Failed to build ${fw.name}`)
        process.exitCode = 1
    } else {
        console.log(`✅ ${fw.name} built`)
    }
}

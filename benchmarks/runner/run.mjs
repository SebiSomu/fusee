import { FRAMEWORKS, TESTS, DEFAULT_RUNS } from './config.mjs'
import { startStaticServer, stopStaticServer } from './static-server.mjs'
import { measureFramework } from './measure.mjs'
import { printTerminalReport, saveResults } from './report.mjs'

function parseArgs() {
    const args = process.argv.slice(2)
    const opts = { runs: DEFAULT_RUNS, only: null, headed: false }

    for (const arg of args) {
        if (arg.startsWith('--runs=')) opts.runs = parseInt(arg.slice(7), 10)
        if (arg.startsWith('--only=')) opts.only = arg.slice(7).split(',')
        if (arg === '--headed') opts.headed = true
    }

    return opts
}

async function main() {
    const opts = parseArgs()
    const frameworks = opts.only
        ? FRAMEWORKS.filter((f) => opts.only.includes(f.id))
        : FRAMEWORKS

    if (frameworks.length === 0) {
        console.error('No frameworks matched --only filter. Available:', FRAMEWORKS.map((f) => f.id).join(', '))
        process.exit(1)
    }

    console.log(`\n🚀 Fusée Benchmark Suite`)
    console.log(`   Frameworks: ${frameworks.map((f) => f.name).join(', ')}`)
    console.log(`   Tests: ${TESTS.map((t) => t.id).join(', ')}`)
    console.log(`   Runs per test: ${opts.runs}\n`)

    const allResults = { __names: {} }

    for (const fw of frameworks) {
        allResults.__names[fw.id] = fw.name
        console.log(`\n🔧 Starting static server for ${fw.name} on port ${fw.port}...`)

        let server
        try {
            server = await startStaticServer(fw.id, fw.port)
        } catch (err) {
            console.error(`❌ Could not start server for ${fw.name}: ${err.message}`)
            console.error(`   Did you run "npm run build:apps" first?`)
            allResults[fw.id] = Object.fromEntries(
                TESTS.map((t) => [t.id, { error: 'server failed to start' }])
            )
            continue
        }

        try {
            console.log(`⏱  Measuring ${fw.name}...`)
            const results = await measureFramework(fw, TESTS, {
                runs: opts.runs,
                headless: !opts.headed,
                onProgress: (fw, test, current, total) => {
                    process.stdout.write(`\r   ${fw.name} / ${test.id}: ${current}/${total} runs`)
                    if (current === total) process.stdout.write('\n')
                },
            })
            allResults[fw.id] = results
        } finally {
            await stopStaticServer(server)
        }
    }

    printTerminalReport(allResults)
    saveResults(allResults, opts.runs)
    console.log('📄 Results saved to benchmarks/results/latest.json and latest.md\n')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})

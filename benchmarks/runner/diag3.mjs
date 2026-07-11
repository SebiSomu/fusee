import { compile } from '../../framework/core/compiler/main-compiler.js'
import fs from 'node:fs'

const src = fs.readFileSync('apps/fusee/src/App.template.html', 'utf8')
const { code, warnings } = compile(src, { filename: 'App.template.html', runtimePath: 'fusee/runtime/h.js' })
console.log('=== WARNINGS ===')
console.log(warnings)
console.log('=== CODE ===')
console.log(code)

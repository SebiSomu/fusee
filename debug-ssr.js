import { compile } from './framework/core/compiler/rust-compiler.js'

console.log('=== TEST f-if ===')
const t1 = compile(`
    <div>
        <p f-if="role === 'admin'">Admin View</p>
        <p f-else-if="role === 'editor'">Editor View</p>
        <p f-else>Guest View</p>
    </div>
`, { target: 'ssr' })
console.log(t1.code)

console.log()
console.log('=== TEST f-for ===')
const t2 = compile(`
    <ul>
        <li f-for="item in items" :key="item.id">{{ item.name }}</li>
    </ul>
`, { target: 'ssr' })
console.log(t2.code)

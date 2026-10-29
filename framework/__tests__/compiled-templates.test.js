import { describe, it, expect, vi, afterEach } from 'vitest'
import * as hRuntime from '../core/h.js'
import * as ssrRuntime from '../core/ssr.js'
import { compile } from '../core/compiler/main-compiler.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { signal, batch } from '../core/signal.js'
import { defineComponent, defineCompiledComponent, onMount } from '../core/component.js'
import { defineComponent as jsxDefineComponent, jsx } from '../core/jsx-runtime.js'

/** Evaluates compiled module code with its runtime import bound to the given module. */
function loadModule(code, runtime, exportName) {
    const body = code
        .replace(/^import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];?/m, (_, names) => `const {${names}} = __runtime;`)
        .replace(new RegExp(`export\\s+(async\\s+)?function\\s+${exportName}`), (_, isAsync) => `${isAsync ?? ''}function ${exportName}`)
    return new Function('__runtime', `${body}\nreturn ${exportName}`)(runtime)
}

const clientRender = (template) => loadModule(compile(template).code, hRuntime, 'render')
const ssrRender = (template) => loadModule(compile(template, { target: 'ssr' }).ssrCode, ssrRuntime, 'renderSSR')

/** Mounts a compiled template into a fresh container. */
function mountTemplate(template, ctx) {
    const container = document.createElement('div')
    const api = hRuntime.mount(clientRender(template), ctx, {}, container)
    return { container, api }
}

/** Visible text of an HTML string, ignoring hydration comments. */
function textOf(html) {
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent
}

const items = (el, selector = 'li') => [...el.querySelectorAll(selector)].map(n => n.textContent)

afterEach(() => vi.restoreAllMocks())

describe('f-for loop variables', () => {
    const cases = [
        ['item fields and index', '<ul><li f-for="(row, i) in rows" :key="row.id">{{ i }}:{{ row.id }}={{ row.label }}</li></ul>'],
        ['the item itself', '<ul><li f-for="tag in tags">{{ tag }}</li></ul>'],
        ['expressions mixing item and context', '<ul><li f-for="row in rows" :key="row.id">{{ row.id * factor }}</li></ul>'],
        ['nested loops', '<div><ul f-for="group in groups" :key="group.name"><li f-for="row in group.rows" :key="row.id">{{ group.name }}/{{ row.id }}</li></ul></div>'],
        ['f-if inside a loop', '<ul><li f-for="row in rows" :key="row.id"><b f-if="row.id > 1">{{ row.label }}</b></li></ul>']
    ]
    const ctx = () => ({
        rows: [{ id: 1, label: 'one' }, { id: 2, label: 'two' }, { id: 3, label: 'three' }],
        tags: ['a', 'b'],
        factor: 10,
        groups: [{ name: 'g1', rows: [{ id: 1 }, { id: 2 }] }, { name: 'g2', rows: [{ id: 3 }] }]
    })

    it.each(cases)('renders the same text on client and server: %s', async (_, template) => {
        const { container } = mountTemplate(template, ctx())
        const html = await ssrRender(template)(ctx(), {})

        expect(container.textContent).not.toBe('')
        expect(container.textContent).toBe(textOf(html))
    })

    it('keeps templates that call the item explicitly working', () => {
        const { container } = mountTemplate('<ul><li f-for="row in rows" :key="row().id">{{ row().id }}</li></ul>', { rows: [{ id: 7 }, { id: 8 }] })
        expect(items(container)).toEqual(['7', '8'])
    })
})

describe('initial render of conditionals and lists', () => {
    it('renders a list that is non-empty at mount', () => {
        const { container } = mountTemplate('<ul><li f-for="n in nums">{{ n }}</li></ul>', { nums: signal([1, 2, 3]) })
        expect(items(container)).toEqual(['1', '2', '3'])
    })

    it('renders an f-if branch that is true at mount and still reacts', () => {
        const shown = signal(true)
        const { container } = mountTemplate('<div><b f-if="shown">yes</b><i f-else>no</i></div>', { shown })
        expect(container.textContent).toBe('yes')

        shown(false)
        expect(container.textContent).toBe('no')
    })

    it('renders a list nested in an f-if branch at mount', () => {
        const { container } = mountTemplate('<div><ul f-if="open"><li f-for="n in nums">{{ n }}</li></ul></div>', { open: true, nums: [4, 5] })
        expect(items(container)).toEqual(['4', '5'])
    })

    it('keeps nested elements in place in compiled component renders', () => {
        const container = document.createElement('div')
        defineComponent({
            setup: () => ({ nums: [1, 2] }),
            render: clientRender('<ul class="list"><li f-for="n in nums">{{ n }}</li></ul>')
        })().render(container)

        expect(container.children).toHaveLength(1)
        expect(container.querySelector('ul.list').children).toHaveLength(2)
        expect(items(container)).toEqual(['1', '2'])
    })
})

describe('defineCompiledComponent', () => {
    it('renders a compiled render function and runs lifecycle hooks', () => {
        const mounted = vi.fn()
        const container = document.createElement('div')
        const count = signal(1)
        defineCompiledComponent({
            setup() {
                onMount(mounted)
                return { count }
            },
            render: clientRender('<p><b>{{ count }}</b></p>')
        })().render(container)

        expect(container.innerHTML).toContain('<p><b>')
        expect(container.textContent).toBe('1')
        expect(mounted).toHaveBeenCalledOnce()

        count(2)
        expect(container.textContent).toBe('2')
    })

    it('runs mount hooks for a component without markup', () => {
        const mounted = vi.fn()
        defineCompiledComponent({ setup() { onMount(mounted); return {} } })().render(document.createElement('div'))
        expect(mounted).toHaveBeenCalledOnce()
    })

    it('rejects string templates with a pointer to defineComponent()', () => {
        const api = defineCompiledComponent({ setup: () => ({ template: '<p>hi</p>' }) })()
        expect(() => api.render(document.createElement('div'))).toThrow(/defineComponent\(\) for string templates/)
    })

    it('leaves defineComponent() string templates working', () => {
        const container = document.createElement('div')
        defineComponent({ setup: () => ({ name: 'x', template: '<p>{{ name }}</p>' }) })().render(container)
        expect(container.textContent).toBe('x')
    })

    it('keeps the template compiler out of the compiled-only import graph', () => {
        const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../core')
        const seen = new Set()
        const visit = (file) => {
            if (seen.has(file)) return
            seen.add(file)
            const source = fs.readFileSync(file, 'utf-8')
            for (const [, spec] of source.matchAll(/^\s*(?:import|export)\s[^'"]*from\s+['"](\.[^'"]+)['"]/gm)) {
                visit(path.resolve(path.dirname(file), spec))
            }
        }
        visit(path.join(coreDir, 'component-core.js'))
        visit(path.join(coreDir, 'jsx-runtime.js'))

        const reached = [...seen].map(f => path.relative(coreDir, f).split(path.sep).join('/'))
        expect(reached).not.toContain('compiler.js')
        expect(reached).not.toContain('directives.js')
    })
})

describe('JSX components', () => {
    it('render nested markup through the JSX runtime', () => {
        const container = document.createElement('div')
        const Card = jsxDefineComponent({
            setup: () => ({}),
            render: () => [jsx('section', { class: 'card', children: [jsx('h2', { children: 'Title' }), jsx('p', { children: 'Body' })] })]
        })
        Card().render(container)

        expect(container.children).toHaveLength(1)
        expect(container.querySelector('section.card > h2').textContent).toBe('Title')
        expect(container.querySelector('section.card > p').textContent).toBe('Body')
    })

    it('render static and reactive text children, as the Babel plugin emits them', () => {
        const container = document.createElement('div')
        const count = signal(1)
        jsxDefineComponent({
            setup: () => ({}),
            render: () => [jsx('h2', { children: ['Count: ', () => count(), ' / ', 10] })]
        })().render(container)

        expect(container.querySelector('h2').textContent).toBe('Count: 1 / 10')
        count(2)
        expect(container.querySelector('h2').textContent).toBe('Count: 2 / 10')
    })
})

describe('keyed list updates', () => {
    /** Mounts a keyed list of rows with a label signal each, like the benchmark app. */
    function mountRows(count) {
        const rows = signal(Array.from({ length: count }, (_, i) => ({ id: i + 1, label: signal(`row ${i + 1}`) })))
        const { container } = mountTemplate('<table><tbody><tr f-for="row in rows" :key="row.id"><td class="id">{{ row.id }}</td><td>{{ row.label() }}</td></tr></tbody></table>', { rows })
        const ids = () => items(container, 'td.id')
        return { rows, container, ids }
    }

    it('swaps two rows, moving the existing nodes without warnings', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { rows, container, ids } = mountRows(5)
        const [, second, , fourth] = container.querySelectorAll('tr')

        batch(() => {
            const list = rows().slice()
            ;[list[1], list[3]] = [list[3], list[1]]
            rows(list)
        })

        expect(ids()).toEqual(['1', '4', '3', '2', '5'])
        expect(container.querySelectorAll('tr')[1]).toBe(fourth)
        expect(container.querySelectorAll('tr')[3]).toBe(second)
        expect(warn).not.toHaveBeenCalled()
    })

    it('stays consistent across a swap followed by more updates', () => {
        const { rows, ids } = mountRows(5)

        rows([rows()[0], rows()[3], rows()[2], rows()[1], rows()[4]])
        rows(rows().map(row => ({ ...row })))
        rows([...rows(), { id: 6, label: signal('row 6') }])

        expect(ids()).toEqual(['1', '4', '3', '2', '5', '6'])
    })

    it('updates rows in place when the keys stay the same', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const rows = signal([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
        const { container } = mountTemplate('<ul><li f-for="row in rows" :key="row.id">{{ row.name }}</li></ul>', { rows })
        const first = container.querySelector('li')

        rows([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])

        expect(items(container)).toEqual(['A', 'B'])
        expect(container.querySelector('li')).toBe(first)
        expect(warn).not.toHaveBeenCalled()
    })

    it('runs the benchmark operations on 1,000 rows', () => {
        const { rows, ids, container } = mountRows(1000)
        expect(ids()).toHaveLength(1000)

        batch(() => { for (let i = 0; i < rows().length; i += 10) rows()[i].label(rows()[i].label() + ' !!!') })
        expect(container.querySelectorAll('tr')[10].textContent).toBe('11row 11 !!!')

        batch(() => {
            const list = rows().slice()
            ;[list[1], list[998]] = [list[998], list[1]]
            rows(list)
        })
        expect([ids()[1], ids()[998]]).toEqual(['999', '2'])

        rows([])
        expect(ids()).toHaveLength(0)
    })
})

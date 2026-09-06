import { html, render } from 'lit'

let idCounter = 1

function buildRow(id) {
    return { id, label: `row ${id}` }
}

function buildRows(count) {
    return Array.from({ length: count }, () => buildRow(idCounter++))
}

let rows = []

function App() {
    return html`
        <table class="table">
            <tbody>
                ${rows.map(row => html`
                    <tr>
                        <td class="col-id">${row.id}</td>
                        <td class="col-label">${row.label}</td>
                    </tr>
                `)}
            </tbody>
        </table>
    `
}

render(html`<${App} />`, document.getElementById('app'))

window.__bench = {
    create(n) {
        idCounter = 1
        rows = buildRows(n)
        render(html`<${App} />`, document.getElementById('app'))
    },
    update() {
        rows = rows.map((r, i) => (i % 10 === 0 ? { ...r, label: r.label + ' !!!' } : r))
        render(html`<${App} />`, document.getElementById('app'))
    },
    swap() {
        if (rows.length <= 998) return
        const copy = rows.slice()
        const tmp = copy[1]
        copy[1] = copy[998]
        copy[998] = tmp
        rows = copy
        render(html`<${App} />`, document.getElementById('app'))
    },
    clear() {
        rows = []
        render(html`<${App} />`, document.getElementById('app'))
    },
    rowCount() {
        return document.querySelectorAll('.col-id').length
    },
}

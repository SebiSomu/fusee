import { render } from 'preact'
import { useState } from 'preact/hooks'

let idCounter = 1

function buildRow(id) {
    return { id, label: `row ${id}` }
}

function buildRows(count) {
    return Array.from({ length: count }, () => buildRow(idCounter++))
}

function App() {
    const [rows, setRows] = useState([])

    window.__benchSetRows = setRows

    return (
        <table class="table">
            <tbody>
                {rows.map((row) => (
                    <tr key={row.id}>
                        <td class="col-id">{row.id}</td>
                        <td class="col-label">{row.label}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

render(<App />, document.getElementById('app'))

window.__bench = {
    create(n) {
        idCounter = 1
        window.__benchSetRows(buildRows(n))
    },
    update() {
        window.__benchSetRows((rows) =>
            rows.map((r, i) => (i % 10 === 0 ? { ...r, label: r.label + ' !!!' } : r))
        )
    },
    swap() {
        window.__benchSetRows((rows) => {
            if (rows.length <= 998) return rows
            const copy = rows.slice()
            const tmp = copy[1]
            copy[1] = copy[998]
            copy[998] = tmp
            return copy
        })
    },
    clear() {
        window.__benchSetRows([])
    },
    rowCount() {
        return document.querySelectorAll('.col-id').length
    },
}

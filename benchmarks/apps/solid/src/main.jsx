/* @refresh reload */
import { render } from 'solid-js/web'
import { createSignal, For } from 'solid-js'

let idCounter = 1

function buildRow(id) {
    return { id, label: `row ${id}` }
}

function buildRows(count) {
    return Array.from({ length: count }, () => buildRow(idCounter++))
}

function App() {
    const [rows, setRows] = createSignal([])

    window.__bench = {
        create(n) {
            idCounter = 1
            setRows(buildRows(n))
        },
        update() {
            setRows((prev) =>
                prev.map((r, i) => (i % 10 === 0 ? { ...r, label: r.label + ' !!!' } : r))
            )
        },
        swap() {
            setRows((prev) => {
                if (prev.length <= 998) return prev
                const copy = prev.slice()
                const tmp = copy[1]
                copy[1] = copy[998]
                copy[998] = tmp
                return copy
            })
        },
        clear() {
            setRows([])
        },
        rowCount() {
            return document.querySelectorAll('.col-id').length
        },
    }

    return (
        <table class="table">
            <tbody>
                <For each={rows()}>
                    {(row) => (
                        <tr>
                            <td class="col-id">{row.id}</td>
                            <td class="col-label">{row.label}</td>
                        </tr>
                    )}
                </For>
            </tbody>
        </table>
    )
}

render(() => <App />, document.getElementById('app'))

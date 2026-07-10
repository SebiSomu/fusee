import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik'

interface Row {
    id: number
    label: string
}

let idCounter = 1

function buildRow(id: number): Row {
    return { id, label: `row ${id}` }
}

function buildRows(count: number): Row[] {
    return Array.from({ length: count }, () => buildRow(idCounter++))
}

export const App = component$(() => {
    const rows = useSignal<Row[]>([])

    useVisibleTask$(({ cleanup }) => {
        ;(window as any).__bench = {
            create: (n: number) => {
                idCounter = 1
                rows.value = buildRows(n)
            },
            update: () => {
                rows.value = rows.value.map((r, i) =>
                    i % 10 === 0 ? { ...r, label: r.label + ' !!!' } : r
                )
            },
            swap: () => {
                if (rows.value.length <= 998) return
                const copy = rows.value.slice()
                const tmp = copy[1]
                copy[1] = copy[998]
                copy[998] = tmp
                rows.value = copy
            },
            clear: () => {
                rows.value = []
            },
            rowCount: () => document.querySelectorAll('.col-id').length,
        }

        cleanup(() => {
            delete (window as any).__bench
        })
    })

    return (
        <table class="table">
            <tbody>
                {rows.value.map((row) => (
                    <tr key={row.id}>
                        <td class="col-id">{row.id}</td>
                        <td class="col-label">{row.label}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
})

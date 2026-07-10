import { Component, signal } from '@angular/core'

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

@Component({
    selector: 'app-root',
    standalone: true,
    template: `
        <table class="table">
            <tbody>
                @for (row of rows(); track row.id) {
                    <tr>
                        <td class="col-id">{{ row.id }}</td>
                        <td class="col-label">{{ row.label }}</td>
                    </tr>
                }
            </tbody>
        </table>
    `,
})
export class AppComponent {
    rows = signal<Row[]>([])

    constructor() {
        ;(window as any).__bench = {
            create: (n: number) => {
                idCounter = 1
                this.rows.set(buildRows(n))
            },
            update: () => {
                this.rows.update((current) =>
                    current.map((r, i) => (i % 10 === 0 ? { ...r, label: r.label + ' !!!' } : r))
                )
            },
            swap: () => {
                this.rows.update((current) => {
                    if (current.length <= 998) return current
                    const copy = current.slice()
                    const tmp = copy[1]
                    copy[1] = copy[998]
                    copy[998] = tmp
                    return copy
                })
            },
            clear: () => {
                this.rows.set([])
            },
            rowCount: () => document.querySelectorAll('.col-id').length,
        }
    }
}

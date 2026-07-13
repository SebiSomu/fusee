import m from 'mithril'

if (typeof m.mount !== 'function') {
    throw new Error('m.mount is not available')
}

let idCounter = 1

function buildRow(id) {
    return { id, label: `row ${id}` }
}

function buildRows(count) {
    return Array.from({ length: count }, () => buildRow(idCounter++))
}

let rows = []

const App = {
    view: function() {
        return m('table.table', [
            m('tbody', rows.map(row =>
                m('tr', [
                    m('td.col-id', row.id),
                    m('td.col-label', row.label)
                ])
            ))
        ])
    }
}

const mount = m.mount
mount(document.getElementById('app'), App)

window.__bench = {
    create(n) {
        idCounter = 1
        rows = buildRows(n)
        mount(document.getElementById('app'), App)
    },
    update() {
        rows = rows.map((r, i) => (i % 10 === 0 ? { ...r, label: r.label + ' !!!' } : r))
        mount(document.getElementById('app'), App)
    },
    swap() {
        if (rows.length <= 998) return
        const copy = rows.slice()
        const tmp = copy[1]
        copy[1] = copy[998]
        copy[998] = tmp
        rows = copy
        mount(document.getElementById('app'), App)
    },
    clear() {
        rows = []
        mount(document.getElementById('app'), App)
    },
    rowCount() {
        return document.querySelectorAll('.col-id').length
    },
}

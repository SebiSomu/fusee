<script>
    let idCounter = 1
    let rows = $state([])

    function buildRow(id) {
        return { id, label: `row ${id}` }
    }

    function buildRows(count) {
        return Array.from({ length: count }, () => buildRow(idCounter++))
    }

    window.__bench = {
        create(n) {
            idCounter = 1
            rows = buildRows(n)
        },
        update() {
            for (let i = 0; i < rows.length; i += 10) {
                rows[i] = { ...rows[i], label: rows[i].label + ' !!!' }
            }
        },
        swap() {
            if (rows.length <= 998) return
            const tmp = rows[1]
            rows[1] = rows[998]
            rows[998] = tmp
        },
        clear() {
            rows = []
        },
        rowCount() {
            return document.querySelectorAll('.col-id').length
        },
    }
</script>

<table class="table">
    <tbody>
        {#each rows as row (row.id)}
            <tr>
                <td class="col-id">{row.id}</td>
                <td class="col-label">{row.label}</td>
            </tr>
        {/each}
    </tbody>
</table>

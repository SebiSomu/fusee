<script setup>
import { ref } from 'vue'

let idCounter = 1

function buildRow(id) {
    return { id, label: `row ${id}` }
}

function buildRows(count) {
    return Array.from({ length: count }, () => buildRow(idCounter++))
}

const rows = ref([])

window.__bench = {
    create(n) {
        idCounter = 1
        rows.value = buildRows(n)
    },
    update() {
        const next = rows.value.slice()
        for (let i = 0; i < next.length; i += 10) {
            next[i] = { ...next[i], label: next[i].label + ' !!!' }
        }
        rows.value = next
    },
    swap() {
        if (rows.value.length <= 998) return
        const next = rows.value.slice()
        const tmp = next[1]
        next[1] = next[998]
        next[998] = tmp
        rows.value = next
    },
    clear() {
        rows.value = []
    },
    rowCount() {
        return document.querySelectorAll('.col-id').length
    },
}
</script>

<template>
    <table class="table">
        <tbody>
            <tr v-for="row in rows" :key="row.id">
                <td class="col-id">{{ row.id }}</td>
                <td class="col-label">{{ row.label }}</td>
            </tr>
        </tbody>
    </table>
</template>

import { defineComponent, signal, computed, effect, batch, untrack, onMount, onUnmount } from '../../framework/index.js'

export const Counter = defineComponent({
    props: {
        initialValue: { type: String, default: '0' },
        parentTitle: { type: String, default: '' }
    },
    setup(props) {
        const count = signal(Number(props.initialValue) || 0)
        const multiplier = signal(1)
        
        const double = computed(() => {
            console.log('[Counter] computing double...')
            return count() * 2
        })

        const valueClass = computed(() =>
            count() >= 0 ? 'value positive' : 'value negative'
        )

        const isZero = computed(() => count() === 0)

        const counterTitle = computed(() =>
            `Counter: ${count()} (×${multiplier()})`
        )

        effect(() => {
            console.log(`[Counter Effect] Count: ${count()} | Step ignored in tracking: ${untrack(() => multiplier())}`)
        })

        function updateMultiple() {
            batch(() => {
                count(count() + 5)
                multiplier(multiplier() + 1)
            })
        }

        function increment() { count(count() + 1) }
        function decrement() { count(count() - 1) }
        function reset()     { count(0) }

        onMount(() => console.log('[Counter] mounted, initial:', count()))
        onUnmount(() => console.log('[Counter] unmounted'))

        return {
            count,
            multiplier,
            double,
            valueClass,
            isZero,
            counterTitle,
            increment,
            decrement,
            reset,
            updateMultiple,
            get parentTitle() { return props.parentTitle },
            template: `
                <div class="counter" :title="counterTitle">
                    <h2>Counter</h2>
                    <p style="font-size: 0.8rem; color: #888;">Message from Home: {{ parentTitle }}</p>
                    <p class="{{ valueClass }}">Count: {{ count }} (Multiplier step: {{ multiplier }})</p>
                    <p class="derived">double: {{ double }}</p>
                    <div class="actions">
                        <button @click="decrement">−</button>
                        <button @click="reset" :disabled="isZero">reset</button>
                        <button @click="increment">+</button>
                        <button @click="updateMultiple">+5 & Step (Batched)</button>
                    </div>
                </div>
            `
        }
    }
})


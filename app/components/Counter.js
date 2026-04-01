import { defineComponent, signal, computed, effect, batch, untrack, onMount, onUnmount } from '../../framework/index.js'

export const Counter = defineComponent({
    props: {
        initialValue: { type: String, default: '0' }
    },
    setup(props) {
        const count = signal(Number(props.initialValue) || 0)
        const multiplier = signal(1)
        
        // TEST: computed cu lazy loading
        const double = computed(() => {
            console.log('[Counter] computing double...')
            return count() * 2
        })

        // Exemplu untrack: efectul reacționează la schimbările 'count',
        // dar ignoră schimbările 'multiplier' datorită lui untrack().
        effect(() => {
            console.log(`[Counter Effect] Count: ${count()} | Step ignored in tracking: ${untrack(() => multiplier())}`)
        })

        // Exemplu batch: update multiple fără a interoga interfața sau efectele conectate
        // de mai multe ori
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
            increment,
            decrement,
            reset,
            updateMultiple,
            template: `
                <div class="counter">
                    <h2>Counter</h2>
                    <p class="value">Count: {{ count }} (Multiplier step: {{ multiplier }})</p>
                    <p class="derived">double: {{ double }}</p>
                    <div class="actions">
                        <button @click="decrement">−</button>
                        <button @click="reset">reset</button>
                        <button @click="increment">+</button>
                        <button @click="updateMultiple">+5 & Step (Batched)</button>
                    </div>
                </div>
            `
        }
    }
})

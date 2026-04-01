import { defineComponent, signal, computed, effect, batch, untrack, onMount, onUnmount, type Signal, type Computed } from '../../framework/index.js'

type CounterProps = {
    initialValue?: string
}

type CounterResult = {
    count: Signal<number>
    multiplier: Signal<number>
    double: Computed<number>
    increment: () => void
    decrement: () => void
    reset: () => void
    updateMultiple: () => void
    template: string
}

export const Counter = defineComponent({
    props: {
        initialValue: { type: String, default: '0' }
    },
    setup(props: CounterProps): CounterResult {
        const count = signal<number>(Number(props.initialValue) || 0)
        const multiplier = signal<number>(1)

        const double = computed(() => count() * 2)

        effect(() => {
            console.log(`[Counter Effect] Count: ${count()} | Step ignored in tracking: ${untrack(() => multiplier())}`)
        })

        function updateMultiple(): void {
            batch(() => {
                count(count() + 5)
                multiplier(multiplier() + 1)
            })
        }

        function increment(): void {
            count(count() + 1)
        }

        function decrement(): void {
            count(count() - 1)
        }

        function reset(): void {
            count(0)
        }

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

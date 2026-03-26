import { defineComponent, signal, computed, onMount, onUnmount } from '../../framework/index.js'

export const Counter = defineComponent({
    props: ['initialValue'],
    setup(props) {
        const count = signal(Number(props.initialValue) || 0)
        
        // TEST: computed cu lazy loading
        const double = computed(() => {
            console.log('[Counter] computing double...')
            return count() * 2
        })

        function increment() { count(count() + 1) }
        function decrement() { count(count() - 1) }
        function reset()     { count(0) }

        onMount(() => console.log('[Counter] mounted, initial:', count()))
        onUnmount(() => console.log('[Counter] unmounted'))

        return {
            count,
            double,
            increment,
            decrement,
            reset,
            template: `
                <div class="counter">
                    <h2>Counter</h2>
                    <p class="value">{{ count }}</p>
                    <p class="derived">double: {{ double }}</p>
                    <div class="actions">
                        <button @click="decrement">−</button>
                        <button @click="reset">reset</button>
                        <button @click="increment">+</button>
                    </div>
                </div>
            `
        }
    }
})

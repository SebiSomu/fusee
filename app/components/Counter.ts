import { defineComponent, signal, onMount, onUnmount, type Signal, type ComponentOptions } from '../../framework/index.js'

type CounterProps = {
    initialValue?: string
}

type CounterResult = {
    count: Signal<number>
    double: Signal<number>
    increment: () => void
    decrement: () => void
    reset: () => void
    template: string
}

export const Counter = defineComponent({
    props: ['initialValue'],
    setup(props: CounterProps): CounterResult {
        const count = signal<number>(Number(props.initialValue) || 0)
        const double = signal<number>(0)

        function increment(): void { 
            count(count() + 1) 
            double(count() * 2) 
        }
        
        function decrement(): void { 
            count(count() - 1) 
            double(count() * 2) 
        }
        
        function reset(): void { 
            count(0) 
            double(0) 
        }

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
} as ComponentOptions)

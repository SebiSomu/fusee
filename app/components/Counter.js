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
                <div class="counter" :title="counterTitle" @keydown.arrowup.window="increment" @keydown.arrowdown.window="decrement">
                    <h2>Counter</h2>
                    <p style="font-size: 0.8rem; color: #888;">Message from Home: {{ parentTitle }}</p>
                    
                    <p class="{{ valueClass }}">
                        Count: {{ count }} (Multiplier step: {{ multiplier }})
                    </p>
                    <p class="derived">double: {{ double }}</p>
                    
                    <div class="actions">
                        <button @click.prevent="decrement">−</button>
                        <button @click.once="reset" :disabled="isZero">Reset (Once only demo)</button>
                        <button @click="increment">+</button>
                        <button @click="updateMultiple">+5 & Step (Batched)</button>
                    </div>

                    <div class="extras" style="margin-top: 24px; border-top: 1px solid rgba(0,0,0,0.08); padding-top: 20px;">
                        <p style="font-weight: 600; font-size: 0.9rem; margin-bottom: 12px; color: #444;">Advanced Controls</p>
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                            <input 
                                type="text" 
                                placeholder="Set count..." 
                                style="flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9rem; outline: none; transition: border-color 0.2s;"
                                onfocus="this.style.borderColor = '#3b82f6'"
                                onblur="this.style.borderColor = '#ddd'"
                                @keyup.enter="count(Number($event.target.value) || 0); $event.target.value = ''"
                            >
                            <button 
                                style="padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; font-size: 0.9rem; transition: opacity 0.2s;"
                                onmouseover="this.style.opacity = '0.9'"
                                onmouseout="this.style.opacity = '1'"
                                @click="console.log('Clicked at: ' + $event.clientX + 'x' + $event.clientY)"
                            >
                                Log Position
                            </button>
                        </div>
                        <p style="font-size: 0.75rem; color: #888;">
                            Tip: Use Up/Down arrows to nudge globally, or Enter in the box above.
                        </p>
                    </div>
                </div>
            `
        }
    }
})

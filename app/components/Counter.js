import { defineComponent, signal, onMount, onUnmount } from '../../framework/index.js'

export const Counter = defineComponent({
  props: ['initialValue'],
  setup(props) {
    const count = signal(Number(props.initialValue) || 0)
    const double = signal(0)

    // Manual computed: keep double in sync
    // (could use computed() from framework too)
    function increment() { count(count() + 1); double(count() * 2) }
    function decrement() { count(count() - 1); double(count() * 2) }
    function reset()     { count(0); double(0) }

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

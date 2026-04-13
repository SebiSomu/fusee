import { defineComposable, assertSetupContext, signal, computed, onMount, onUnmount } from '../../framework/index.js'

export const counterLogic = defineComposable((initial: number = 0, step: number = 1) => {
    const count   = signal(initial)
    const doubled = computed(() => count() * 2)
    const isEven  = computed(() => count() % 2 === 0)

    const increment = () => count(count() + step)
    const decrement = () => count(count() - step)
    const reset     = () => count(initial)

    return { count, doubled, isEven, increment, decrement, reset }
})

export const mouseTracker = defineComposable(() => {
    assertSetupContext('mouseTracker')

    const x = signal(0)
    const y = signal(0)

    const onMove = (e: MouseEvent) => { 
        x(e.clientX)
        y(e.clientY) 
    }

    onMount(() => window.addEventListener('mousemove', onMove))
    onUnmount(() => window.removeEventListener('mousemove', onMove))

    return { x, y }
})

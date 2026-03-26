import { defineComponent, signal, onMount } from '../../framework/index.js'

export const About = defineComponent({
    props: [],
    setup() {
        const loaded = signal(false)

        onMount(() => {
            setTimeout(() => loaded(true), 300)
        })

        return {
            loaded,
            template: `
                <div class="page">
                    <h1>About</h1>
                    <p>Framework custom — prototip SPA.</p>
                    <p><strong>Features:</strong> signals, defineComponent, hash router, lifecycle hooks.</p>
                    <p class="status">{{ loaded }}</p>
                </div>
            `
        }
    }
})

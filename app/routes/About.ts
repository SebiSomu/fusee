import type { Signal, EmptyProps } from '../../framework/index.js'

type AboutResult = {
    loaded: Signal<boolean>
    template: string
}

export const About = defineComponent({
    props: [],
    setup(): AboutResult {
        const loaded = signal<boolean>(false)

        onMount(() => {
            setTimeout(() => loaded(true), 300)
        })

        return {
            loaded,
            template: `
                <div class="page">
                    <h1>About</h1>
                    <p>Framework custom — prototip SPA.</p>
                    <p><strong>Features:</strong> signals, defineComponent, History API router, lifecycle hooks.</p>
                    <p class="status">{{ loaded }}</p>
                </div>
            `
        }
    }
})

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
                    <p>Framework custom — SPA prototipe</p>
                    <p><strong>Features:</strong> signals, defineComponent, hash router, lifecycle hooks.</p>
                    <p class="status">{{ loaded }}</p>
                </div>
            `
        }
    }
})

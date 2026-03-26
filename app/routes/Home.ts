import { defineComponent, signal, type Signal, type EmptyProps } from '../../framework/index.js'
import { Counter } from '../components/Counter.js'

type HomeResult = {
    title: Signal<string>
    template: string
}

export const Home = defineComponent({
    props: [],
    components: { Counter },
    setup(): HomeResult {
        const title = signal<string>('Welcome!')

        return {
            title,
            template: `
                <div class="page">
                    <h1>{{ title }}</h1>
                    <p>This is an SPA built with my own JavaScript custom framework!</p>
                    <p>Made with passion by Sebastian Șomu</p>
                    {{ Counter }}
                </div>
            `
        }
    }
})

import { defineComponent, signal } from '../../framework/index.js'
import { Counter } from '../components/Counter.js'

export const Home = defineComponent({
    props: [],
    components: { Counter },
    setup() {
        const title = signal('Welcome!')
        const showCounter = signal(true)

        return {
            title,
            showCounter,
            toggleCounter: () => showCounter(!showCounter()),
            template: `
                <div class="page">
                    <h1>{{ title.toUpperCase() + '!!!' }}</h1>
                    <p>This is an SPA built with my own JavaScript custom framework!</p>
                    <p>Made with passion by Sebastian Șomu</p>

                    <button @click="toggleCounter" class="primary-btn" style="margin: 20px 0;">Toggle Counter (f-if)</button>
                    
                    <div f-if="showCounter">
                        {{ Counter initialValue="10" :parentTitle="title" }}
                    </div>
                </div>
            `
        }
    }
})

import { defineComponent, signal } from '../../framework/index.js'
import { Counter } from '../components/Counter.js'

export const Home = defineComponent({
    props: [],
    components: { Counter },
    setup() {
        const title = signal('Welcome!')
        const showCounter = signal(true)
        const userName = signal('Guest')

        return {
            title,
            showCounter,
            userName,
            toggleCounter: () => showCounter(!showCounter()),
            template: `
                <div class="page">
                    <h1>{{ title.toUpperCase() + ', ' + (userName || 'Guest') + '!!!' }}</h1>
                    <p>This is an SPA built with my own JavaScript custom framework!</p>
                    <p>Made with passion by Sebastian Șomu</p>

                    <div style="margin: 20px 0; background: #1a1a24; padding: 15px; border-radius: 8px;">
                        <label style="display: block; margin-bottom: 8px; color: #8b8bff;">Two-way binding (f-model):</label>
                        <input type="text" f-model="userName" placeholder="Enter your name..." 
                               style="padding: 8px 12px; border-radius: 4px; border: 1px solid #3a3a5a; background: #0f0f1a; color: #fff; width: 100%; max-width: 300px;" />
                    </div>

                    <button @click="toggleCounter" class="primary-btn" style="margin: 20px 0;">Toggle Counter (f-if)</button>
                    
                    <div f-if="showCounter">
                        {{ Counter initialValue="10" :parentTitle="title" }}
                    </div>
                </div>
            `
        }
    }
})

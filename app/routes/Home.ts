import { defineComponent, signal, type SignalAccessor } from '../../framework/index.js'
import { UserForm } from '../components/UserForm.js'
import { CounterSection } from '../components/CounterSection.js'

type HomeResult = {
    title: SignalAccessor<string>
    changeTitle: () => void
    template: string
}

export const Home = defineComponent({
    components: { UserForm, CounterSection },
    setup(): HomeResult {
        const title = signal('Welcome!')

        return {
            title,
            changeTitle: () => title('Changed Title!'),
            template: `
                <div class="page">
                    <h1>{{ title.toUpperCase() }}</h1>
                    <p>This is an SPA built with my own JavaScript custom framework!</p>
                    <p>Made with passion by Sebastian Șomu</p>
                    
                    <button @click="changeTitle" class="primary-btn" style="margin-bottom: 20px;">Change App Title</button>
                    
                    {{ UserForm }}
                    
                    {{ CounterSection :pageTitle="title" }}
                </div>
            `
        }
    }
})

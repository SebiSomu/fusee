import type { SignalAccessor } from 'fusee-framework'
import { Counter } from './Counter.js'

type CounterSectionProps = {
    pageTitle: string
}

type CounterSectionResult = {
    showCounter: SignalAccessor<boolean>
    title: string
    toggleCounter: () => void
    template: string
}

export const CounterSection = defineComponent({
    props: {
        pageTitle: { type: String, default: '' }
    },
    components: { Counter },
    setup(props: CounterSectionProps): CounterSectionResult {
        const showCounter = signal(true)

        return {
            showCounter,
            get title() { return props.pageTitle || '' },
            toggleCounter: () => showCounter(!showCounter()),
            template: `
                <div style="margin-top: 30px; border-top: 1px solid #333; padding-top: 20px;">
                    <h3>Counter Section</h3>
                    <button @click="toggleCounter" class="primary-btn" style="margin: 10px 0;">Toggle Counter (f-if)</button>
                    
                    <div f-if="showCounter">
                        {{ Counter initialValue="10" :parentTitle="title" }}
                    </div>
                    <div f-elif="title === 'Welcome!'">
                        <p style="color: yellow;">Counter is hidden, but title is "Welcome!"</p>
                    </div>
                    <div f-else>
                        <p style="color: red;">Counter is hidden and title is changed.</p>
                    </div>
                </div>
            `
        }
    }
})

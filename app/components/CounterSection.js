import { Counter } from './Counter.js'

export const CounterSection = defineComponent({
    props: {
        pageTitle: { type: String, default: '' }
    },
    components: { Counter },
    setup(props, { emit }) {
        const showCounter = signal(true)
        inspect(showCounter)

        return {
            showCounter,
            get title() { return props.pageTitle },
            toggleCounter: () => showCounter(!showCounter()),

            // 🔄 Re-emit handlers - forward events from Counter to parent
            handleCounterChange: (value) => emit('counter-change', value),
            handleCounterReset: () => emit('counter-reset'),
            handleCustomEvent: (count, multiplier) => emit('custom-event', count, multiplier),

            template: `
                <div style="margin-top: 30px; border-top: 1px solid #333; padding-top: 20px;">
                    <h3>Counter Section</h3>
                    <button @click="toggleCounter" class="primary-btn" style="margin: 10px 0;">Toggle Counter (f-if)</button>
                    
                    <div f-if="showCounter">
                        {{ Counter initialValue="10" :parentTitle="title" @counter-change="handleCounterChange" @counter-reset="handleCounterReset" @custom-event="handleCustomEvent" }}
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

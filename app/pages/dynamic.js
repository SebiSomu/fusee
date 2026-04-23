import { DynamicA } from '../components/DynamicA.js'
import { DynamicB } from '../components/DynamicB.js'

export const TestDynamic = defineComponent({
    components: { DynamicA, DynamicB },
    setup() {
        const currentType = signal('DynamicA')
        const sharedTitle = signal('Test Dinamic active')

        return {
            currentType,
            sharedTitle,
            toggle: () => {
                currentType(currentType() === 'DynamicA' ? 'DynamicB' : 'DynamicA')
            },
            template: `
                <div class="page">
                    <h1>Dynamic Components System (Vue-style)</h1>
                    <p>Using the custom <code>f-is</code> directive.</p>
                    
                    <div style="margin: 20px 0; display: flex; gap: 10px; align-items: center;">
                        <button @click="toggle" class="primary-btn">Toggle Component</button>
                        <span>Active: <strong>{{ currentType }}</strong></span>
                    </div>

                    <input f-model="sharedTitle" style="margin-bottom: 20px; padding: 8px; border-radius: 4px; border: 1px solid #444; background: #222; color: white; width: 100%;">

                    <hr style="border: 0; border-top: 1px solid #444; margin: 30px 0;">

                    <div f-is="currentType" f-keepAlive :title="sharedTitle"></div>
                    
                    <p style="margin-top: 40px; color: #888; font-size: 0.9em;">
                        Note: The component above changes reactively when you click the button. 
                        The <code>:title</code> prop is automatically passed to the active component.
                    </p>
                </div>
            `
        }
    }
})

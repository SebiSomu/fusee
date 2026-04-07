import { provide, inject } from '../../framework/index.js'
import { ChildComponent } from './ChildComponent.js'

interface UserData {
    name: string
    age: number
}

// ParentComponent - provides values to child components
export const ParentComponent = defineComponent({
    components: { ChildComponent },
    setup() {
        const count = signal(42)
        const message = signal('Hello from Parent!')
        const userData: UserData = { name: 'John', age: 30 }

        // Provide values to descendant components
        provide('count', count)
        provide('message', message)
        provide('userData', userData)
        provide('appVersion', '1.0.0')

        function updateCount(): void {
            count(count() + 10)
        }

        return {
            count,
            message,
            userData,
            updateCount,
            template: `
                <div style="padding: 20px; border: 2px solid #4CAF50; border-radius: 8px; margin: 20px 0; color: #000;">
                    <h2 style="color: #4CAF50;">Parent Component</h2>
                    <p>I'm providing these values to my children:</p>
                    <ul style="background: #333; padding: 15px; border-radius: 4px; color: #fff;">
                        <li><strong>count:</strong> {{ count }}</li>
                        <li><strong>message:</strong> {{ message }}</li>
                        <li><strong>userData:</strong> {{ userData.name }} ({{ userData.age }} years)</li>
                        <li><strong>appVersion:</strong> 1.0.0</li>
                    </ul>
                    <button @click="updateCount" style="margin-top: 10px; padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Update Count (+10)
                    </button>
                    
                    <div style="margin-top: 20px;">
                        {{ ChildComponent }}
                    </div>
                </div>
            `
        }
    }
})

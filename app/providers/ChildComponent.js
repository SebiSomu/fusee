import { defineComponent, inject } from '../../framework/index.js'
import { GrandchildComponent } from './GrandchildComponent.js'

// ChildComponent - injects values from parent (ParentComponent)
export const ChildComponent = defineComponent({
    components: { GrandchildComponent },
    setup(props, { emit }) {
        // Inject values provided by the parent
        const count = inject('count')
        const message = inject('message')

        // These are NOT provided by parent, so they will be undefined
        const nonExistent = inject('nonExistent')

        function updateMessage() {
            message('Message updated by Child!')
        }

        return {
            count,
            message,
            nonExistent,
            updateMessage,
            template: `
                <div style="padding: 15px; border: 2px solid #2196F3; border-radius: 8px; margin-top: 15px; background: #1a1a1a; color: #fff;">
                    <h3 style="color: #2196F3;">Child Component (direct child of Parent)</h3>
                    <p>I'm injecting these values from my parent:</p>
                    <ul style="background: #333; padding: 12px; border-radius: 4px; color: #fff;">
                        <li><strong>count:</strong> {{ count }}</li>
                        <li><strong>message:</strong> {{ message }}</li>
                        <li><strong>nonExistent:</strong> {{ nonExistent || 'undefined' }}</li>
                    </ul>
                    <button @click="updateMessage" style="margin-top: 10px; padding: 6px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Update Message
                    </button>
                    
                    <div style="margin-top: 15px;">
                        {{ GrandchildComponent }}
                    </div>
                </div>
            `
        }
    }
})

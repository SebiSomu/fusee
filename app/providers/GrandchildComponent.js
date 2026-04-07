import { defineComponent, inject } from '../../framework/index.js'

// GrandchildComponent - injects values from grandparent (ParentComponent)
// This demonstrates that inject() searches the entire ancestor chain
export const GrandchildComponent = defineComponent({
    setup(props, { emit }) {
        // Inject from grandparent (2 levels up)
        const count = inject('count')
        const message = inject('message')
        const userData = inject('userData')
        const appVersion = inject('appVersion')

        function updateMessage() {
            // message is a signal, so we can update it from grandchild!
            message('Updated from Grandchild!')
        }

        return {
            count,
            message,
            userData,
            appVersion,
            updateMessage,
            template: `
                <div style="padding: 15px; border: 2px solid #9C27B0; border-radius: 8px; margin-top: 15px; background: #1a1a1a; color: #fff;">
                    <h4 style="color: #9C27B0;">Grandchild Component (injected from grandparent!)</h4>
                    <p>I can inject from any ancestor, not just my direct parent:</p>
                    <ul style="background: #333; padding: 12px; border-radius: 4px; color: #fff;">
                        <li><strong>count:</strong> {{ count }} <em>(from ParentComponent)</em></li>
                        <li><strong>message:</strong> {{ message }} <em>(from ParentComponent)</em></li>
                        <li><strong>userData:</strong> {{ userData.name }}, {{ userData.age }} <em>(from ParentComponent)</em></li>
                        <li><strong>appVersion:</strong> {{ appVersion }} <em>(from ParentComponent)</em></li>
                    </ul>
                    <button @click="updateMessage" style="margin-top: 10px; padding: 6px 12px; background: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Update Message from Grandchild
                    </button>
                </div>
            `
        }
    }
})

import { navigate } from '../../framework/index.js'

export const NotFound = defineComponent({
    setup() {
        return {
            navigate,
            template: `
                <div class="page">
                    <h1 style="color: #ff6b6b;">404 - Page Not Found</h1>
                    <p>The requested route does not exist.</p>
                    <button @click="navigate('/')" class="primary-btn">Go Home</button>
                </div>
            `
        }
    }
})

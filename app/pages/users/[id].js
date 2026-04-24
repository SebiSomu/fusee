import { routeParams, computed } from '../../../framework/index.js'

/**
 * User Detail (JS) — child of the /users layout.
 */
export const UserDetail = defineComponent({
    setup() {
        const params = routeParams
        const userId = computed(() => params().id || '?')

        return {
            userId,
            template: `
                <div class="page">
                    <h1>👤 User #{{ userId }} (JS)</h1>
                    <div class="demo-card">
                        <p>This content area changes while the sidebar persists.</p>
                        <p>Current User ID: <strong style="color: #8b8bff;">{{ userId }}</strong></p>
                    </div>
                </div>
            `
        }
    }
})

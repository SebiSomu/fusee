import { routeParams, computed, defineComponent } from '../../../framework/index'

/**
 * User Detail — child of the /users layout.
 * Renders inside the layout's <div data-router-view> for /users/:id.
 */
export const UserDetail = defineComponent({
    setup() {
        const params = routeParams
        const userId = computed(() => params().id || '?')

        return {
            userId,
            params,
            template: `
                <div class="page">
                    <h1>👤 User #{{ userId }}</h1>

                    <div class="demo-card">
                        <h2>User Profile</h2>
                        <p style="color: #8b8bff; font-size: 1.2rem; margin-bottom: 0.5rem;">
                            ID: <strong>{{ userId }}</strong>
                        </p>
                        <p style="color: #888; font-size: 0.9rem;">
                            This page renders inside the Users layout.
                            The sidebar persists — only this content area changes.
                        </p>
                    </div>

                    <div class="demo-card" style="margin-top: 1rem;">
                        <h2>Navigate to Other Users</h2>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <a href="/users/1" f-link class="cmp-btn" style="text-decoration: none;">User #1</a>
                            <a href="/users/2" f-link class="cmp-btn" style="text-decoration: none;">User #2</a>
                            <a href="/users/42" f-link class="cmp-btn" style="text-decoration: none;">User #42</a>
                            <a href="/users/999" f-link class="cmp-btn" style="text-decoration: none;">User #999</a>
                        </div>
                        <p style="margin-top: 0.75rem; color: #555; font-size: 0.8rem;">
                            ⚡ Notice: the layout sidebar does NOT re-render when switching users!
                        </p>
                    </div>
                </div>
            `
        }
    }
})

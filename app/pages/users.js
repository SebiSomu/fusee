import { currentRoute, routeParams, computed } from '../../framework/index.js'

/**
 * Users Layout (JS) — persists across all /users/* child routes.
 */
export const UsersLayout = defineComponent({
    setup() {
        const path = currentRoute
        const params = routeParams
        const paramsJson = computed(() => JSON.stringify(params()))

        return {
            path,
            paramsJson,
            template: `
                <div style="display: flex; gap: 2rem; min-height: 60vh;">
                    <aside style="
                        width: 220px;
                        flex-shrink: 0;
                        background: #13131d;
                        border: 1px solid #2a2a3a;
                        border-radius: 12px;
                        padding: 1.25rem;
                    ">
                        <h3 style="color: #8b8bff; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 1rem;">👥 Users</h3>
                        <nav style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <a href="/users" f-link class="cmp-btn" style="text-decoration: none; text-align: left;">📋 All Users</a>
                            <a href="/users/1" f-link class="cmp-btn" style="text-decoration: none; text-align: left;">👤 User #1</a>
                            <a href="/users/2" f-link class="cmp-btn" style="text-decoration: none; text-align: left;">👤 User #2</a>
                        </nav>
                        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #2a2a3a; font-size: 0.75rem; color: #555;">
                            <p>Route: <span style="color: #8b8bff;">{{ path }}</span></p>
                            <p>Params: <span style="color: #34d399;">{{ paramsJson }}</span></p>
                        </div>
                    </aside>
                    <main style="flex: 1;">
                        <div data-router-view></div>
                    </main>
                </div>
            `
        }
    }
})

import { currentRoute, routeParams, computed, defineComponent } from '../../framework/index'

/**
 * Users Layout — persists across all /users/* child routes.
 * Contains a sidebar nav and a <div data-router-view> where children render.
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
                    <!-- Sidebar (persists across child navigations) -->
                    <aside style="
                        width: 220px;
                        flex-shrink: 0;
                        background: #13131d;
                        border: 1px solid #2a2a3a;
                        border-radius: 12px;
                        padding: 1.25rem;
                    ">
                        <h3 style="
                            color: #8b8bff;
                            font-size: 0.85rem;
                            text-transform: uppercase;
                            letter-spacing: 0.1em;
                            margin-bottom: 1rem;
                        ">👥 Users</h3>

                        <nav style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <a href="/users" f-link class="cmp-btn" style="
                                text-decoration: none;
                                text-align: left;
                                font-size: 0.9rem;
                            ">📋 All Users</a>
                            <a href="/users/1" f-link class="cmp-btn" style="
                                text-decoration: none;
                                text-align: left;
                                font-size: 0.9rem;
                            ">👤 User #1</a>
                            <a href="/users/2" f-link class="cmp-btn" style="
                                text-decoration: none;
                                text-align: left;
                                font-size: 0.9rem;
                            ">👤 User #2</a>
                            <a href="/users/42" f-link class="cmp-btn" style="
                                text-decoration: none;
                                text-align: left;
                                font-size: 0.9rem;
                            ">👤 User #42</a>
                        </nav>

                        <div style="
                            margin-top: 1.5rem;
                            padding-top: 1rem;
                            border-top: 1px solid #2a2a3a;
                            font-size: 0.75rem;
                            color: #555;
                        ">
                            <p style="margin-bottom: 4px;">Route: <span style="color: #8b8bff;">{{ path }}</span></p>
                            <p>Params: <span style="color: #34d399;">{{ paramsJson }}</span></p>
                        </div>
                    </aside>

                    <!-- Child route renders here -->
                    <main style="flex: 1; min-width: 0;">
                        <div data-router-view></div>
                    </main>
                </div>
            `
        }
    }
})

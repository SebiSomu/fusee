import { currentRoute, navigate, routeParams, routeQuery, computed } from '../../framework/index.js'

export const RouterExample = defineComponent({
    setup() {
        const path = currentRoute
        const params = routeParams
        const query = routeQuery
        const paramsJson = computed(() => JSON.stringify(params()))
        const queryJson = computed(() => JSON.stringify(query()))

        const updateQuery = () => {
            const now = new Date().toLocaleTimeString()
            navigate(`${path()}?t=${encodeURIComponent(now)}&user=guest`)
        }

        return {
            path,
            paramsJson,
            queryJson,
            navigate,
            updateQuery,
            template: `
                <div class="page">
                    <h1>🔗 Router API Demo</h1>

                    <div class="demo-card">
                        <h2>currentRoute Signal</h2>
                        <code style="color: #8b8bff; font-size: 1.5rem;">{{ path }}</code>
                    </div>

                    <div class="demo-card">
                        <h2>routeQuery Signal (Query Params)</h2>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <a href="/router?search=framework&page=1" f-link class="cmp-btn" style="text-decoration: none;">?search=framework&page=1</a>
                            <a href="/router?filter=active&sort=desc" f-link class="cmp-btn" style="text-decoration: none;">?filter=active&sort=desc</a>
                            <button @click="updateQuery" class="cmp-btn">Update Time via Query</button>
                        </div>
                        <code style="color: #f59e0b; font-size: 1.2rem;">{{ queryJson }}</code>
                        <p style="margin-top: 10px; color: #888; font-size: 0.9rem;">
                            Query parameters are automatically parsed into the routeQuery signal.
                        </p>
                    </div>

                    <div class="demo-card">
                        <h2>routeParams Signal (Dynamic Routes)</h2>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <a href="/users/123" f-link class="cmp-btn" style="text-decoration: none;">User 123</a>
                            <a href="/users/456" f-link class="cmp-btn" style="text-decoration: none;">User 456</a>
                            <a href="/posts/tech/my-post" f-link class="cmp-btn" style="text-decoration: none;">Post Route</a>
                        </div>
                        <code style="color: #34d399; font-size: 1.2rem;">{{ paramsJson }}</code>
                        <p style="margin-top: 10px; color: #888; font-size: 0.9rem;">
                            Dynamic routes use :param syntax (e.g., /users/:id or /posts/:category/:slug)
                        </p>
                    </div>

                    <div class="demo-card">
                        <h2>navigate() Test</h2>
                        <div style="display: flex; gap: 10px;">
                            <button @click="navigate('/')" class="cmp-btn">Home</button>
                            <button @click="navigate('/about')" class="cmp-btn">About</button>
                            <button @click="navigate('/404')" class="cmp-btn" style="border-color: #ff6b6b; color: #ff6b6b;">404 Page</button>
                            <button @click="navigate('/wildcard-test-123')" class="cmp-btn" style="border-color: #f59e0b; color: #f59e0b;">Wildcard</button>
                        </div>
                    </div>

                    <div class="demo-card">
                        <h2>f-link Test</h2>
                        <div style="display: flex; gap: 10px;">
                            <a href="/" f-link class="cmp-btn" style="text-decoration: none;">Home</a>
                            <a href="/about" f-link class="cmp-btn" style="text-decoration: none;">About</a>
                        </div>
                    </div>
                </div>
            `
        }
    }
})

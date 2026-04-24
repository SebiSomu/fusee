import { currentRoute, navigate, routeParams, computed, defineComponent } from '../../../framework/index.js'

export const RouterExample = defineComponent({
    setup() {
        const path = currentRoute
        const params = routeParams
        const paramsJson = computed(() => JSON.stringify(params()))

        return {
            path,
            paramsJson,
            navigate,
            template: `
                <div class="page">
                    <h1>🔗 Router API Demo</h1>

                    <div class="demo-card">
                        <h2>currentRoute Signal</h2>
                        <code style="color: #8b8bff; font-size: 1.5rem;">{{ path }}</code>
                    </div>

                    <div class="demo-card">
                        <h2>routeParams Signal (Dynamic Routes)</h2>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <a href="/objects/123" f-link class="cmp-btn" style="text-decoration: none;">Object 123</a>
                            <a href="/objects/456" f-link class="cmp-btn" style="text-decoration: none;">Object 456</a>
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
                            <button @click="navigate('/wildcard-test-123')" class="cmp-btn" style="border-color: #f59e0b; color: #f59e0b;">Wildcard</button>
                            <button @click="navigate('/nonexistent')" class="cmp-btn" style="border-color: #ff6b6b; color: #ff6b6b;">404 Test</button>
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

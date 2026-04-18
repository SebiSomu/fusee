import { currentRoute, navigate } from '../../framework/index.js'

export const RouterExample = defineComponent({
    setup() {
        const path = currentRoute

        return {
            path,
            navigate,
            template: `
                <div class="page">
                    <h1>🔗 Router API Demo</h1>

                    <div class="demo-card">
                        <h2>currentRoute Signal</h2>
                        <code style="color: #8b8bff; font-size: 1.5rem;">{{ path }}</code>
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

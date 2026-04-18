import { currentRoute, navigate } from '../../framework/index.js'

export const WildcardDemo = defineComponent({
    setup() {
        const path = currentRoute

        return {
            path,
            navigate,
            template: `
                <div class="page">
                    <h1 style="color: #f59e0b;">🎯 Wildcard Match!</h1>
                    <p>This route matched via wildcard <code>path: '*'</code></p>
                    
                    <div class="demo-card">
                        <h2>Current Path</h2>
                        <code style="color: #f59e0b; font-size: 1.5rem;">{{ path }}</code>
                    </div>

                    <div class="demo-card">
                        <h2>Test Wildcard</h2>
                        <p>Any path works here:</p>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button @click="navigate('/random-123')" class="cmp-btn">/random-123</button>
                            <button @click="navigate('/test/abc')" class="cmp-btn">/test/abc</button>
                            <button @click="navigate('/deep/nested/path')" class="cmp-btn">/deep/nested/path</button>
                        </div>
                    </div>

                    <button @click="navigate('/')" class="primary-btn">Back Home</button>
                </div>
            `
        }
    }
})

import { currentRoute, navigate } from '../../framework/index.js'

// Demo: Multiple paths for the same component
// Navigating between /login and /register will NOT cause re-render
export const AuthRoutes = defineComponent({
    setup() {
        const path = currentRoute
        
        return {
            path,
            navigate,
            template: `
                <div class="page">
                    <h1>🔐 Auth Page (Multiple Paths Demo)</h1>
                    <div class="demo-card">
                        <p>Current path: <code>{{ path }}</code></p>
                        <p style="color: #888; margin-top: 10px;">
                            This component handles multiple paths: <code>/login</code> and <code>/register</code>
                        </p>
                        <p style="color: #34d399;">
                            ✅ The component is NOT re-rendered when switching between these paths!
                        </p>
                    </div>
                    
                    <div class="demo-card">
                        <h2>Switch Paths (No Re-render)</h2>
                        <div style="display: flex; gap: 10px;">
                            <button @click="navigate('/login')" class="cmp-btn">Go to /login</button>
                            <button @click="navigate('/register')" class="cmp-btn" style="border-color: #8b8bff; color: #8b8bff;">Go to /register</button>
                        </div>
                    </div>
                    
                    <div class="demo-card">
                        <h2>Test Re-render</h2>
                        <button @click="navigate('/about')" class="cmp-btn" style="border-color: #f59e0b; color: #f59e0b;">Go to /about (causes re-render)</button>
                    </div>
                </div>
            `
        }
    }
})

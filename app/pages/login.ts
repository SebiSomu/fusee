import { defineComponent, navigate } from '../../framework/index.js'

export const Login = defineComponent({
    setup() {
        return {
            login() {
                localStorage.setItem('fake_auth_token', 'true')
                navigate('/dashboard')
            },
            template: `
                <div class="page">
                    <h1 style="color: #ff6b6b;">🔑 Login Required</h1>
                    <div class="demo-card">
                        <p>You were redirected here because the route you tried to access is protected by middleware.</p>
                        <button class="cmp-btn" @click="login()" style="margin-top: 1rem; border-color: #34d399; color: #34d399;">Simulate Login</button>
                    </div>
                </div>
            `
        }
    }
})

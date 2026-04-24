import { defineComponent } from '../../framework/index.js'

export const Dashboard = defineComponent({
    middleware: ['auth'], // Uses the named middleware 'auth'
    setup() {
        return {
            logout() {
                localStorage.removeItem('fake_auth_token')
                location.reload() // quick way to force state clear for demo
            },
            template: `
                <div class="page">
                    <h1 style="color: #10b981;">🔒 Protected Dashboard</h1>
                    <div class="demo-card">
                        <p>If you can see this, you passed the <strong>auth</strong> middleware successfully!</p>
                        <button class="cmp-btn" @click="logout()" style="margin-top: 1rem; border-color: #ff6b6b; color: #ff6b6b;">Logout</button>
                    </div>
                </div>
            `
        }
    }
})

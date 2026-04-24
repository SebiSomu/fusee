import { defineComponent } from '../../../framework/index'

export const UsersIndex = defineComponent({
    setup() {
        return {
            template: `
                <div class="page">
                    <h1>📋 All Users</h1>
                    <p style="margin-bottom: 1.5rem;">Select a user from the sidebar to view their profile.</p>

                    <div style="display: grid; gap: 0.75rem;">
                        <a href="/users/1" f-link class="demo-card" style="text-decoration: none; cursor: pointer; transition: border-color 0.2s;">
                            <h2 style="font-size: 1rem;">👤 Alice Johnson</h2>
                            <p style="font-size: 0.85rem; color: #888;">ID: 1 · Engineer</p>
                        </a>
                        <a href="/users/2" f-link class="demo-card" style="text-decoration: none; cursor: pointer; transition: border-color 0.2s;">
                            <h2 style="font-size: 1rem;">👤 Bob Smith</h2>
                            <p style="font-size: 0.85rem; color: #888;">ID: 2 · Designer</p>
                        </a>
                        <a href="/users/42" f-link class="demo-card" style="text-decoration: none; cursor: pointer; transition: border-color 0.2s;">
                            <h2 style="font-size: 1rem;">👤 Charlie Dev</h2>
                            <p style="font-size: 0.85rem; color: #888;">ID: 42 · Architect</p>
                        </a>
                    </div>
                </div>
            `
        }
    }
})

export const UsersIndex = defineComponent({
    setup() {
        return {
            template: `
                <div class="page">
                    <h1>📋 All Users (JS)</h1>
                    <p>Select a user from the sidebar to view their profile.</p>
                    <div style="display: grid; gap: 0.75rem; margin-top: 1rem;">
                        <a href="/users/1" f-link class="demo-card" style="text-decoration: none;">
                            <h2>👤 Alice Johnson</h2>
                            <p>ID: 1 · Engineer</p>
                        </a>
                        <a href="/users/2" f-link class="demo-card" style="text-decoration: none;">
                            <h2>👤 Bob Smith</h2>
                            <p>ID: 2 · Designer</p>
                        </a>
                    </div>
                </div>
            `
        }
    }
})

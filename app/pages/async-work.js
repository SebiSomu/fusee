import { defineComponent, signal, resource } from '../../framework/index.js'

export default defineComponent({
    setup() {
        const userId = signal(1)

        const [user, { refetch }] = resource(userId, async (id) => {
            const response = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
            if (!response.ok) throw new Error('User not found')
            return response.json()
        })

        return {
            userId,
            user,
            refetch,
            next: () => userId(userId() + 1),
            prev: () => userId() > 1 && userId(userId() - 1),
            template: `
                <div class="page">
                    <h1>⚡ Async Work with Resources</h1>
                    <p>This page demonstrates the new <code>resource</code> primitive, inspired by SolidJS. It handles async data fetching with reactive loading and error states.</p>
                    
                    <div class="demo-section">
                        <div class="flex gap-2 mb-6">
                            <button @click="prev" class="cmp-btn minus" :disabled="userId() <= 1">← Previous</button>
                            <button @click="next" class="cmp-btn plus">Next User →</button>
                            <button @click="refetch" class="cmp-btn reset">🔄 Refetch</button>
                            <span class="ml-4 flex items-center">Current ID: <strong>{{ userId }}</strong></span>
                        </div>

                        <div f-if="user.loading()">
                            <div class="action-btn btn-loading">Fetching data from API...</div>
                        </div>

                        <div f-if="user.error()">
                            <div class="action-btn btn-error">
                                <strong>Error:</strong> {{ user.error().message }}
                            </div>
                        </div>

                        <div f-if="user() && !user.loading()">
                            <div class="theme-box theme-dark">
                                <h2 class="text-xl font-bold mb-2">{{ user().name }}</h2>
                                <p><strong>Username:</strong> @{{ user().username }}</p>
                                <p><strong>Email:</strong> {{ user().email }}</p>
                                <p><strong>Website:</strong> <a :href="'https://' + user().website" target="_blank" style="color: #8b8bff">{{ user().website }}</a></p>
                                <p><strong>Company:</strong> {{ user().company.name }}</p>
                            </div>
                        </div>
                    </div>

                    <div class="info-section">
                        <h2>How it works:</h2>
                        <ul>
                            <li><strong>Reactive Source:</strong> The fetcher automatically reruns when <code>userId</code> changes.</li>
                            <li><strong>State Tracking:</strong> <code>user.loading()</code> and <code>user.error()</code> are signals updated by the framework.</li>
                            <li><strong>Batching:</strong> Loading and data states are updated atomically to prevent UI flickers.</li>
                        </ul>
                    </div>
                </div>
            `
        }
    }
})

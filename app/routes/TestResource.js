import { defineComponent, signal, resource } from '../../framework/index.js'

export default defineComponent({
    setup() {
        const userId = signal(1)

        const [user] = resource(userId, async (id) => {
            const response = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
            if (!response.ok) throw new Error('User not found')
            return response.json()
        })

        return {
            userId,
            user,
            next: () => userId(userId() + 1),
            prev: () => userId() > 1 && userId(userId() - 1),
            template: `
                <div class="p-4">
                    <h1 class="text-2xl font-bold mb-4">Resource Demo</h1>
                    
                    <div class="flex gap-2 mb-4">
                        <button @click="prev" class="px-4 py-2 bg-blue-500 text-white rounded">Prev User</button>
                        <button @click="next" class="px-4 py-2 bg-blue-500 text-white rounded">Next User</button>
                        <span class="py-2">User ID: {{ userId }}</span>
                    </div>

                    <div f-if="user.loading()">
                        <p class="text-gray-500 italic">Loading user data...</p>
                    </div>

                    <div f-if="user.error()">
                        <p class="text-red-500">Error: {{ user.error().message }}</p>
                    </div>

                    <div f-if="user() && !user.loading()">
                        <div class="card border p-4 rounded shadow-lg bg-white">
                            <h2 class="text-xl font-semibold">{{ user().name }}</h2>
                            <p class="text-gray-600">Email: {{ user().email }}</p>
                            <p class="text-gray-600">Company: {{ user().company.name }}</p>
                        </div>
                    </div>
                </div>
            `
        }
    }
})

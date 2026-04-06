type UserFormResult = {
    userName: SignalAccessor<string>
    inputRef: SignalAccessor<HTMLInputElement | null>
    focusInput: () => void
    template: string
}

export const UserForm = defineComponent({
    setup(): UserFormResult {
        const userName = signal('Guest')
        const inputRef = signal<HTMLInputElement | null>(null)

        return {
            userName,
            inputRef,
            focusInput: () => {
                const el = inputRef()
                if (el) {
                    console.log('[UserForm] Focused input via f-ref:', el)
                    el.focus()
                }
            },
            template: `
                <div style="margin: 20px 0; background: #1a1a24; padding: 15px; border-radius: 8px;">
                    <h2 style="color: #fff;">Hello, {{ userName || 'Guest' }}!</h2>
                    <label style="display: block; margin-bottom: 8px; color: #8b8bff;">Two-way binding (f-model):</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" f-ref="inputRef" f-model="userName" placeholder="Enter your name..." 
                               style="padding: 8px 12px; border-radius: 4px; border: 1px solid #3a3a5a; background: #0f0f1a; color: #fff; width: 100%; max-width: 300px;" />
                        <button @click="focusInput" class="primary-btn">Focus Field</button>
                    </div>
                </div>
            `
        }
    }
})

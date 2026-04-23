type Item = {
    id: number
    name: string
}

type TestForResult = {
    items: Signal<Item[]>
    search: Signal<string>
    filteredItems: Computed<Item[]>
    namesSummary: Computed<string>
    updateItem: (id: number, name: string) => void
    addItem: () => void
    shuffleItems: () => void
    template: string
}

export const TestFor = defineComponent({
    setup(): TestForResult {
        const items = signal<Item[]>([
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
            { id: 3, name: 'Item 3' }
        ])
        const search = signal('')
        const filteredItems = items.filter(i =>
            i.name.toLowerCase().includes(search().toLowerCase())
        )
        const namesSummary = filteredItems.map(i => i.name).join(', ')

        return {
            items,
            search,
            filteredItems,
            namesSummary,
            updateItem: (id, newName) => {
                items(items().map(i => i.id === id ? { ...i, name: newName } : i))
            },
            addItem: () => {
                const nextIds = items().map(i => i.id)
                const nextId = nextIds.length > 0 ? Math.max(...nextIds) + 1 : 1
                items.push({ id: nextId, name: `Item ${nextId}` })
            },
            shuffleItems: () => {
                items.sort(() => Math.random() - 0.5)
            },
            template: `
                <div class="page">
                    <h1>Keyed f-for Test (TypeScript)</h1>
                    <p>Focus an input below, then click "Shuffle" or "Add". The focus should stay!</p>

                    <p style="color: #8b8bff; background: #8b8bff11; padding: 10px; border-radius: 4px; border-left: 3px solid #8b8bff;">
                        🔗 <strong>Reactive Summary:</strong> {{ namesSummary || 'No items found' }}
                    </p>
                    
                    <div style="margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px;">
                        <input type="text" f-model="search" placeholder="🔍 Filter items..." 
                               style="padding: 10px; border-radius: 4px; border: 1px solid #444; background: #111; color: #fff; width: 100%;" />
                        
                        <div style="display: flex; gap: 10px;">
                            <button @click="addItem" class="primary-btn">Add Item</button>
                            <button @click="shuffleItems" class="primary-btn">Shuffle Items</button>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div f-for="item in filteredItems" :key="item.id" 
                             style="padding: 10px; border: 1px solid #333; display: flex; gap: 10px; align-items: center;">
                            <span>ID: {{ item.id }}</span>
                            <input type="text" 
                                   :value="item.name" 
                                   @input="updateItem(item().id, $event.target.value)"
                                   placeholder="Type here..." 
                                   style="background: #111; color: #fff; border: 1px solid #444; padding: 5px;" />
                        </div>
                    </div>
                </div>
            `
        }
    }
})

type Item = {
    id: number
    name: string
}

type TestForResult = {
    items: Signal<Item[]>
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

        return {
            items,
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
                    
                    <div style="margin-bottom: 20px; display: flex; gap: 10px;">
                        <button @click="addItem" class="primary-btn">Add Item</button>
                        <button @click="shuffleItems" class="primary-btn">Shuffle Items</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div f-for="item in items" :key="item.id" 
                             style="padding: 10px; border: 1px solid #333; display: flex; gap: 10px; align-items: center;">
                            <span>ID: {{ item.id }}</span>
                            <input type="text" :value="item.name" placeholder="Type here..." 
                                   style="background: #111; color: #fff; border: 1px solid #444; padding: 5px;" />
                        </div>
                    </div>
                </div>
            `
        }
    }
})

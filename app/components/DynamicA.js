export const DynamicA = defineComponent({
    props: ['title'],
    setup(props) {
        onMount(() => console.log('✅ DynamicA mounted'))
        onUnmount(() => console.log('❌ DynamicA unmounted'))
        
        const localValue = signal('')
        
        return {
            title: props.title,
            localValue,
            template: `
                <div style="padding: 20px; background: #1e293b; border-radius: 8px; border: 2px solid #3b82f6;">
                    <h3 style="color: #3b82f6;">Component A</h3>
                    <p>Prop from parent: <strong>{{ title }}</strong></p>
                    <div style="margin-top: 10px;">
                        <label>Local state (persists with f-keepAlive):</label><br>
                        <input f-model="localValue" placeholder="Type something here..." style="background: #0f172a; color: white; border: 1px solid #3b82f6; padding: 5px; width: 100%;">
                    </div>
                </div>
            `
        }
    }
})

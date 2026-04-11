export const DynamicB = defineComponent({
    props: ['title'],
    setup(props) {
        onMount(() => console.log('✅ DynamicB mounted'))
        onUnmount(() => console.log('❌ DynamicB unmounted'))

        const localInfo = signal('')

        return {
            title: props.title,
            localInfo,
            template: `
                <div style="padding: 20px; background: #1e293b; border-radius: 8px; border: 2px solid #ec4899;">
                    <h3 style="color: #ec4899;">Component B</h3>
                    <p>Prop from parent: <strong>{{ title }}</strong></p>
                    <div style="margin-top: 10px;">
                         <label>Local info (B):</label><br>
                         <input f-model="localInfo" placeholder="B settings..." style="background: #1a1a1a; color: white; border: 1px solid #ec4899; padding: 5px; width: 100%;">
                    </div>
                </div>
            `
        }
    }
})

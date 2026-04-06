export const EmitTest = defineComponent({
    setup(props, { emit }) {
        const clickCount = signal(0)
        const lastEvent = signal('None')
        
        inspect(clickCount, lastEvent)
        
        return {
            clickCount,
            lastEvent,
            
            // Butoane pentru test emit
            emitSimple: () => {
                clickCount(clickCount() + 1)
                emit('simple-click')
                lastEvent('simple-click')
            },
            emitWithData: () => {
                const count = clickCount() + 1
                clickCount(count)
                emit('click-with-data', count, 'button-pressed', Date.now())
                lastEvent(`click-with-data: ${count}`)
            },
            emitObject: () => {
                const data = { 
                    timestamp: Date.now(),
                    message: 'Hello from child!',
                    counter: clickCount() + 1
                }
                clickCount(data.counter)
                emit('object-event', data)
                lastEvent(`object-event: ${data.message}`)
            },
            
            template: `
                <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%); border: 2px solid #4da6ff; border-radius: 12px; padding: 24px; margin: 20px 0; color: #fff;">
                    <h3 style="margin: 0 0 16px 0; color: #4da6ff;">🧪 EMIT EVENTS TEST LAB</h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                        <button @click="emitSimple" 
                                style="padding: 16px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 1rem;">
                            📤 EMIT SIMPLE
                            <small style="display: block; font-size: 0.8rem; font-weight: normal; margin-top: 4px;">No data</small>
                        </button>
                        
                        <button @click="emitWithData" 
                                style="padding: 16px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 1rem;">
                            📤 EMIT WITH DATA
                            <small style="display: block; font-size: 0.8rem; font-weight: normal; margin-top: 4px;">count, label, timestamp</small>
                        </button>
                        
                        <button @click="emitObject" 
                                style="padding: 16px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 1rem;">
                            📤 EMIT OBJECT
                            <small style="display: block; font-size: 0.8rem; font-weight: normal; margin-top: 4px;">{ timestamp, message, counter }</small>
                        </button>
                    </div>
                    
                    <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; font-family: monospace;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: #888;">Click Count:</span>
                            <span style="color: #4da6ff; font-size: 1.5rem; font-weight: bold;">{{ clickCount }}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #888;">Last Event:</span>
                            <span style="color: #f59e0b;">{{ lastEvent }}</span>
                        </div>
                    </div>
                    
                    <p style="margin: 16px 0 0 0; font-size: 0.85rem; color: #888; text-align: center;">
                        ✅ Check browser console for emitted events!
                    </p>
                </div>
            `
        }
    }
})

import { UserForm } from '../components/UserForm.js'
import { CounterSection } from '../components/CounterSection.js'
import { Card } from '../components/Card.js'
import { EmitTest } from '../components/EmitTest.js'

export const Home = defineComponent({
    components: { UserForm, CounterSection, Card, EmitTest },
    setup() {
        const title = signal('Welcome!')
        inspect(title)
        
        return {
            title,
            changeTitle: () => title('Changed Title!'),
            
            // 🧪 Emit Event Handlers
            handleCounterChange: (value) => console.log('📢 Counter changed to:', value),
            handleCounterReset: () => console.log('🔄 Counter reset requested!'),
            handleCustomEvent: (count, multiplier) => console.log('🎯 Custom event:', { count, multiplier }),
            
            // 🧪 Emit Test Handlers
            handleSimpleClick: () => console.log('✅ SIMPLE CLICK received from child!'),
            handleClickWithData: (count, label, timestamp) => console.log('✅ CLICK WITH DATA:', { count, label, timestamp }),
            handleObjectEvent: (data) => console.log('✅ OBJECT EVENT received:', data),
            
            template: `
                <div class="page">
                    <h1>{{ title.toUpperCase() }}</h1>
                    <p>This is an SPA built with my own JavaScript custom framework!</p>
                    <p>Made with passion by Sebastian Șomu</p>
                    
                    <button @click="changeTitle" class="primary-btn" style="margin-bottom: 20px;">Change App Title</button>
                    
                    {{ UserForm }}
                    
                    {{ CounterSection @counter-change="handleCounterChange" @counter-reset="handleCounterReset" @custom-event="handleCustomEvent" :pageTitle="title" }}
                    
                    <!-- 🧪 EMIT TEST - NEW SEPARATE COMPONENT -->
                    <h3 style="margin-top: 40px; margin-bottom: 20px; color: #4da6ff;">🧪 EMIT EVENTS TEST LAB</h3>
                    {{ EmitTest @simple-click="handleSimpleClick" @click-with-data="handleClickWithData" @object-event="handleObjectEvent" }}
                    
                    <!-- 🧪 Slots Test -->
                    <h3 style="margin-top: 40px; margin-bottom: 20px;">🎴 Slots Test</h3>
                    
                    {{ Card title="Custom Card" }}
                        <template slot="header">
                            <p style="color: #10b981; font-weight: bold;">🎯 Custom header from parent!</p>
                        </template>
                        <p style="color: #f59e0b;">This is custom content passed through the default slot.</p>
                        <p>You can pass any HTML content here!</p>
                        <template slot="footer">
                            <button style="background: #3b82f6; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                                Custom Footer Button
                            </button>
                        </template>
                    {{ /Card }}
                    
                    {{ Card title="Default Slots Card" }}
                        <p>This card uses only the default slot - no named slots provided.</p>
                    {{ /Card }}
                </div>
            `
        }
    }
})

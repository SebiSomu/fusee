import { Counter } from '../components/Counter.js'
import { UserForm } from '../components/UserForm.js'
import { CounterSection } from '../components/CounterSection.js'
import { Card } from '../components/Card.js'
import { EmitTest } from '../components/EmitTest.js'
import { ParentComponent } from '../providers/index.js'

export const Home = defineComponent({
    components: { UserForm, CounterSection, Card, EmitTest, ParentComponent },
    setup() {
        const title = signal('Welcome!')
        inspect(title)

        const isActive = signal(false)
        const isDisabled = signal(false)
        const isLarge = signal(false)
        const basicClasses = computed(() => ({
            active: isActive(),
            disabled: isDisabled(),
            'is-large': isLarge()
        }))

        const toggleActive = () => isActive(!isActive())
        const toggleDisabled = () => isDisabled(!isDisabled())
        const toggleLarge = () => isLarge(!isLarge())

        return {
            title,
            changeTitle: () => title('Changed Title!'),

            isActive,
            isDisabled,
            isLarge,
            basicClasses,
            toggleActive,
            toggleDisabled,
            toggleLarge,

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

                    <!-- 🎨 f-classList Demo -->
                    <h3 style="margin-top: 40px; margin-bottom: 20px; color: #f59e0b;">🎨 f-classList Demo</h3>
                    <div class="demo-box" f-classList="basicClasses">
                        Demo Box (hover me!)
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
                        <button @click="toggleActive" :class="isActive ? 'btn-on' : 'btn-off'" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;">
                            {{ isActive ? '✓ Active' : '○ Active' }}
                        </button>
                        <button @click="toggleDisabled" :class="isDisabled ? 'btn-on' : 'btn-off'" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;">
                            {{ isDisabled ? '✓ Disabled' : '○ Disabled' }}
                        </button>
                        <button @click="toggleLarge" :class="isLarge ? 'btn-on' : 'btn-off'" style="padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;">
                            {{ isLarge ? '✓ Large' : '○ Large' }}
                        </button>
                    </div>

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
                    
                    <!-- 🧪 PROVIDE / INJECT TEST -->
                    <h3 style="margin-top: 40px; margin-bottom: 20px; color: #4CAF50;">🔗 PROVIDE / INJECT TEST</h3>
                    {{ ParentComponent }}
                </div>
            `
        }
    }
})

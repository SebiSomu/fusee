import { UserForm } from '../components/UserForm.js'
import { CounterSection } from '../components/CounterSection.js'

type HomeResult = {
    title: Signal<string>
    changeTitle: () => void
    isActive: Signal<boolean>
    isDisabled: Signal<boolean>
    isLarge: Signal<boolean>
    basicClasses: Computed<ClassListObject>
    toggleActive: () => void
    toggleDisabled: () => void
    toggleLarge: () => void
    template: string
}

type ClassListObject = Record<string, boolean>

export const Home = defineComponent({
    components: { UserForm, CounterSection },
    setup(): HomeResult {
        const title = signal<string>('Welcome!')

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
            template: `
                <div class="page">
                    <h1>{{ title.toUpperCase() }}</h1>
                    <p>This is an SPA built with my own (TypeScript!) custom framework!</p>
                    <p>Made with passion by Sebastian Șomu</p>

                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0;">
                        <a href="/scroll-demo" f-link class="cmp-btn" style="background: linear-gradient(135deg, #8b8bff, #6b6bff);">
                            🔽 Scroll Behavior Demo
                        </a>
                        <a href="/users" f-link class="cmp-btn">
                            👥 Router Example
                        </a>
                    </div>

                    <button @click="changeTitle" class="primary-btn" style="margin-bottom: 20px;">Change App Title</button>

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

                    {{ CounterSection :pageTitle="title" }}
                </div>
            `
        }
    }
})

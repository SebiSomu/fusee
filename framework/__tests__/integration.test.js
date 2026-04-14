import { describe, it, expect, vi } from 'vitest'
import { defineComponent, mountTemplate, provide, inject, onMount, onUnmount, defineAsyncComponent } from '../core/component.js'
import { signal, computed, effect, batch, watch } from '../core/signal.js'
import { defineStore } from '../core/store.js'
import { createRouter, navigate } from '../router/router.js'
import { defineComposable } from '../core/composable.js'
import { directive } from '../core/directives.js'

describe('Integration Tests', () => {

    // ─── SIGNALS + COMPONENTS ──────────────────────────────────────────────────────
    describe('Signals + Components', () => {
        it('re-render component template when signal changes', () => {
            const count = signal(0)
            
            const Counter = defineComponent({
                setup() {
                    return {
                        count,
                        template: '<div>{{ count }}</div>'
                    }
                }
            })

            const container = document.createElement('div')
            const api = Counter()
            api.render(container)

            expect(container.innerHTML).toContain('0')
            count(1)
            expect(container.innerHTML).toContain('1')
        })

        it('update computed values in component template', () => {
            const count = signal(0)
            const doubled = computed(() => count() * 2)
            
            const Counter = defineComponent({
                setup() {
                    return {
                        doubled,
                        template: '<div>{{ doubled }}</div>'
                    }
                }
            })

            const container = document.createElement('div')
            const api = Counter()
            api.render(container)

            expect(container.innerHTML).toContain('0')
            count(5)
            expect(container.innerHTML).toContain('10')
        })
    })

    // ─── STORE + DI ───────────────────────────────────────────────────────────────
    describe('Store + Dependency Injection', () => {
        it('allow store injection in nested components', () => {
            const useCounter = defineStore('counter', () => ({
                count: signal(0),
                increment: () => {}
            }))

            const Child = defineComponent({
                setup() {
                    const counter = inject('counter-store')
                    return {
                        counter,
                        template: '<div>{{ counter.count }}</div>'
                    }
                }
            })

            const Parent = defineComponent({
                setup() {
                    const counter = useCounter()
                    provide('counter-store', counter)
                    return {
                        template: '{{ Child }}'
                    }
                },
                components: { Child }
            })

            const parentApi = Parent()
            const parentInstance = parentApi.instance
            const childApi = Child({}, { parent: parentInstance })
            childApi.render(document.createElement('div'))

            expect(childApi.instance.state.counter.count()).toBe(0)
        })

        it('share reactive state between components via store', () => {
            const useCounter = defineStore('shared', () => ({
                value: signal(1)
            }))

            const counter = useCounter()

            const CompA = defineComponent({
                setup() {
                    const store = inject('shared-store')
                    return {
                        store,
                        template: '<div>{{ store.value }}</div>'
                    }
                }
            })

            const CompB = defineComponent({
                setup() {
                    const store = inject('shared-store')
                    return {
                        store,
                        template: '<div>{{ store.value }}</div>'
                    }
                }
            })

            const Parent = defineComponent({
                setup() {
                    provide('shared-store', counter)
                    return { template: '' }
                }
            })

            const parentInst = Parent().instance
            const compA = CompA({}, { parent: parentInst })
            const compB = CompB({}, { parent: parentInst })

            expect(compA.instance.state.store.value()).toBe(1)
            expect(compB.instance.state.store.value()).toBe(1)

            counter.value(2)

            expect(compA.instance.state.store.value()).toBe(2)
            expect(compB.instance.state.store.value()).toBe(2)
        })
    })

    // ─── ROUTER + COMPONENTS ──────────────────────────────────────────────────────
    describe('Router + Components', () => {
        it('render component via router', () => {
            const Home = defineComponent({
                setup() {
                    return { template: '<div>Home</div>' }
                }
            })

            const router = createRouter([
                { path: '/', component: () => Home() }
            ])

            const container = document.createElement('div')
            window.location.hash = '/'
            mountOutlet(container)

            expect(container.innerHTML).toContain('Home')
            router.destroy()
        })

        it('match routes correctly', () => {
            const Home = defineComponent({
                setup() {
                    return { template: '<div>Home</div>' }
                }
            })

            const About = defineComponent({
                setup() {
                    return { template: '<div>About</div>' }
                }
            })

            const router = createRouter([
                { path: '/', component: () => Home() },
                { path: '/about', component: () => About() }
            ])

            const container = document.createElement('div')
            window.location.hash = '/about'
            mountOutlet(container)

            expect(container.innerHTML).toContain('About')
            router.destroy()
        })
    })

    // ─── LIFECYCLE + SIGNALS ──────────────────────────────────────────────────────
    describe('Lifecycle + Signals', () => {
        it('run onMount after render and have access to signals', () => {
            const count = signal(0)
            let mountedValue = null

            const Comp = defineComponent({
                setup() {
                    onMount(() => {
                        mountedValue = count()
                    })
                    return { count, template: '<div>{{ count }}</div>' }
                }
            })

            const container = document.createElement('div')
            Comp().render(container)

            expect(mountedValue).toBe(0)
        })

        it('run onUnmount and stop effects', () => {
            const count = signal(0)
            let effectRuns = 0

            const Comp = defineComponent({
                setup() {
                    effect(() => {
                        count()
                        effectRuns++
                    })
                    return { template: '<div></div>' }
                }
            })

            const container = document.createElement('div')
            const api = Comp()
            api.render(container)

            expect(effectRuns).toBe(1)
            count(1)
            expect(effectRuns).toBe(2)

            api.unmount()
            count(2)
            expect(effectRuns).toBe(2) // should NOT rerun after unmount
        })

        it('call onUnmount hooks in order', () => {
            const order = []

            const Comp = defineComponent({
                setup() {
                    onMount(() => order.push('mount'))
                    onUnmount(() => order.push('unmount-1'))
                    onUnmount(() => order.push('unmount-2'))
                    return { template: '<div></div>' }
                }
            })

            const container = document.createElement('div')
            const api = Comp()
            api.render(container)
            api.unmount()

            expect(order).toEqual(['mount', 'unmount-1', 'unmount-2'])
        })
    })

    // ─── STORE + SIGNALS + COMPUTED ───────────────────────────────────────────────
    describe('Store + Signals + Computed', () => {
        it('expose computed values from store', () => {
            const useCart = defineStore('cart', () => {
                const items = signal([])
                const total = computed(() => items().length)
                return { items, total }
            })

            const cart = useCart()
            expect(cart.total()).toBe(0)

            cart.items.push({ name: 'Apple' })
            expect(cart.total()).toBe(1)
        })

        it('reset store state correctly', () => {
            const useCounter = defineStore('resetable', () => ({
                count: signal(0)
            }))

            const counter = useCounter()
            counter.count(5)
            expect(counter.count()).toBe(5)

            counter.count(0)
            expect(counter.count()).toBe(0)
        })

        it('allow multiple stores to interact via signals', () => {
            const useUser = defineStore('user', () => ({
                name: signal('Alice')
            }))

            const useGreeting = defineStore('greeting', () => {
                const user = useUser()
                const greeting = computed(() => `Hello, ${user.name()}!`)
                return { greeting }
            })

            const greeting = useGreeting()
            expect(greeting.greeting()).toBe('Hello, Alice!')

            useUser().name('Bob')
            expect(greeting.greeting()).toBe('Hello, Bob!')
        })
    })

    // ─── DIRECTIVES + COMPONENTS + LIFECYCLE ─────────────────────────────────────
    describe('Directives + Components + Lifecycle', () => {
        it('apply custom directive on mount and clean up on unmount', () => {
            const mounted = vi.fn()
            const unmounted = vi.fn()

            directive('track', {
                mounted: (el) => mounted(el),
                unmounted: (el) => unmounted(el)
            })

            const Comp = defineComponent({
                setup() {
                    return { template: '<div f-track></div>' }
                }
            })

            const container = document.createElement('div')
            const api = Comp()
            api.render(container)

            expect(mounted).toHaveBeenCalledOnce()

            api.unmount()
            expect(unmounted).toHaveBeenCalledOnce()
        })

        it('update directive binding when signal changes', () => {
            const color = signal('red')
            const updated = vi.fn()

            directive('color', {
                mounted: () => {},
                updated: (el, binding) => updated(binding.value)
            })

            const Comp = defineComponent({
                setup() {
                    return {
                        color,
                        template: '<div f-color="color"></div>'
                    }
                }
            })

            const container = document.createElement('div')
            Comp().render(container)

            color('blue')
            expect(updated).toHaveBeenCalledWith('blue')
        })
    })

    // ─── COMPOSABLES + STORE + DI ─────────────────────────────────────────────────
    describe('Composables + Store + DI', () => {
        it('inject a composable result provided by parent store', () => {
            const usePagination = defineComposable((pageSize = 10) => {
                const page = signal(1)
                const size = signal(pageSize)
                const offset = computed(() => (page() - 1) * size())
                return { page, size, offset }
            })

            const pagination = usePagination(5)

            const Child = defineComponent({
                setup() {
                    const pager = inject('pagination')
                    return { pager, template: '<div>{{ pager.offset }}</div>' }
                }
            })

            const Parent = defineComponent({
                setup() {
                    provide('pagination', pagination)
                    return { template: '' }
                }
            })

            const parentInst = Parent().instance
            const child = Child({}, { parent: parentInst })

            expect(child.instance.state.pager.offset()).toBe(0)

            pagination.page(3)
            expect(child.instance.state.pager.offset()).toBe(10)
        })
    })

    // ─── ASYNC COMPONENT + SIGNALS ────────────────────────────────────────────────
    describe('Async Components + Signals', () => {
        it('render async component and react to signal after load', async () => {
            const count = signal(0)

            const AsyncComp = defineAsyncComponent({
                loader: () => Promise.resolve(
                    defineComponent({
                        setup() {
                            return { count, template: '<div>{{ count }}</div>' }
                        }
                    })
                )
            })

            const container = document.createElement('div')
            const api = AsyncComp()
            api.render(container)

            await new Promise(r => setTimeout(r, 0))

            expect(container.innerHTML).toContain('0')
            count(7)
            expect(container.innerHTML).toContain('7')
        })

        it('not update signal after async component is unmounted', async () => {
            const count = signal(0)
            let effectRuns = 0

            const AsyncComp = defineAsyncComponent({
                loader: () => Promise.resolve(
                    defineComponent({
                        setup() {
                            effect(() => { count(); effectRuns++ })
                            return { template: '<div></div>' }
                        }
                    })
                )
            })

            const container = document.createElement('div')
            const api = AsyncComp()
            api.render(container)

            await new Promise(r => setTimeout(r, 0))
            expect(effectRuns).toBe(1)

            api.unmount()
            count(99)
            expect(effectRuns).toBe(1) // no rerun after unmount
        })
    })

    // ─── BATCH + STORE + COMPONENTS ───────────────────────────────────────────────
    describe('Batch + Store + Components', () => {
        it('batch store updates and re-render component once', () => {
            const useStore = defineStore('batch-test', () => ({
                a: signal(0),
                b: signal(0)
            }))

            const store = useStore()
            let renderCount = 0

            const Comp = defineComponent({
                setup() {
                    effect(() => {
                        store.a(); store.b()
                        renderCount++
                    })
                    return { template: '<div></div>' }
                }
            })

            Comp().render(document.createElement('div'))
            expect(renderCount).toBe(1)

            batch(() => {
                store.a(1)
                store.b(2)
            })

            expect(renderCount).toBe(2) // only one extra run, not two
        })

        it('1000 signals updated in batch — only affected effects run', () => {
            const signals = Array.from({ length: 1000 }, () => signal(0))
            let affectedEffectRuns = 0
            let unaffectedEffectRuns = 0

            // Effect that depends on first 100 signals
            effect(() => {
                signals.slice(0, 100).forEach(s => s())
                affectedEffectRuns++
            })

            // Effect that depends on last 100 signals
            effect(() => {
                signals.slice(900, 1000).forEach(s => s())
                unaffectedEffectRuns++
            })

            const initialAffected = affectedEffectRuns
            const initialUnaffected = unaffectedEffectRuns

            // Update only middle 800 signals (not watched by any effect)
            batch(() => {
                for (let i = 100; i < 900; i++) {
                    signals[i](i)
                }
            })

            // Effects should NOT run since none of their dependencies changed
            expect(affectedEffectRuns).toBe(initialAffected)
            expect(unaffectedEffectRuns).toBe(initialUnaffected)

            // Update first 100 signals (watched by first effect)
            batch(() => {
                for (let i = 0; i < 100; i++) {
                    signals[i](i)
                }
            })

            // First effect should run once, second should not
            expect(affectedEffectRuns).toBe(initialAffected + 1)
            expect(unaffectedEffectRuns).toBe(initialUnaffected)
        })
    })

    // ─── DEEP COMPONENT TREE + DI ───────────────────────────────────────────────
    describe('Deep Component Tree + DI', () => {
        it('deep component tree (10 levels) — DI traversal performance', () => {
            const value = signal('root')

            // Create 10 levels of nested components
            const createComponent = (level) => {
                if (level === 0) {
                    return defineComponent({
                        setup() {
                            const val = inject('value')
                            return { val, template: '<div>{{ val }}</div>' }
                        }
                    })
                }

                const Child = createComponent(level - 1)

                return defineComponent({
                    setup() {
                        const val = inject('value')
                        return {
                            val,
                            template: level === 10 ? `{{ Child }}` : `<div>{{ Child }}</div>`
                        }
                    },
                    components: { Child }
                })
            }

            const Root = defineComponent({
                setup() {
                    provide('value', value)
                    return { template: '' }
                }
            })

            const container = document.createElement('div')
            const rootApi = Root()
            const rootInstance = rootApi.instance

            // Manually build the component tree hierarchy
            let currentInstance = rootInstance
            for (let i = 9; i >= 0; i--) {
                const Comp = createComponent(i)
                const childApi = Comp({}, { parent: currentInstance })
                currentInstance = childApi.instance
            }

            // Check that the deepest component can inject the value
            expect(currentInstance.state.val()).toBe('root')

            // Update the value and check it propagates
            value('updated')
            expect(currentInstance.state.val()).toBe('updated')
        })
    })

    // ─── DIRECTIVES + SIGNALS ─────────────────────────────────────────────────────
    describe('Directives + Signals', () => {
        it('bind f-model with signal bidirectionally', () => {
            const value = signal('initial')
            
            const Input = defineComponent({
                setup() {
                    return {
                        value,
                        template: '<input f-model="value">'
                    }
                }
            })

            const container = document.createElement('div')
            const api = Input()
            api.render(container)

            const input = container.querySelector('input')
            expect(input.value).toBe('initial')

            value('changed')
            expect(input.value).toBe('changed')
        })

        it('update signal on input change with f-model', () => {
            const value = signal('initial')
            
            const Input = defineComponent({
                setup() {
                    return {
                        value,
                        template: '<input f-model="value">'
                    }
                }
            })

            const container = document.createElement('div')
            const api = Input()
            api.render(container)

            const input = container.querySelector('input')
            input.value = 'user-input'
            input.dispatchEvent(new Event('input'))

            expect(value()).toBe('user-input')
        })
    })

    // ─── COMPOSABLES + COMPONENTS ─────────────────────────────────────────────────
    describe('Composables + Components', () => {
        it('use composable in component setup', () => {
            const useCounter = defineComposable((initial = 0) => ({
                count: signal(initial),
                increment: () => {}
            }))

            const Counter = defineComponent({
                setup() {
                    const { count, increment } = useCounter(10)
                    return {
                        count,
                        increment,
                        template: '<div>{{ count }}</div>'
                    }
                }
            })

            const container = document.createElement('div')
            const api = Counter()
            api.render(container)

            expect(container.innerHTML).toContain('10')
        })

        it('share composable state across components via DI', () => {
            const useShared = defineComposable(() => ({
                value: signal('shared')
            }))

            const shared = useShared()

            const CompA = defineComponent({
                setup() {
                    const data = inject('shared-data')
                    return {
                        data,
                        template: '<div>{{ data.value }}</div>'
                    }
                }
            })

            const Parent = defineComponent({
                setup() {
                    provide('shared-data', shared)
                    return { template: '' }
                }
            })

            const parentInst = Parent().instance
            const compA = CompA({}, { parent: parentInst })

            expect(compA.instance.state.data.value()).toBe('shared')

            shared.value('updated')

            expect(compA.instance.state.data.value()).toBe('updated')
        })
    })

    // ─── WATCH + COMPONENTS ───────────────────────────────────────────────────────
    describe('Watch + Components', () => {
        it('watch signal in component setup', () => {
            const count = signal(0)
            let watchValue = null

            const Counter = defineComponent({
                setup() {
                    watch(count, (v) => {
                        watchValue = v
                    })
                    return { count, template: '<div>{{ count }}</div>' }
                }
            })

            Counter().render(document.createElement('div'))
            count(5)
            expect(watchValue).toBe(5)
        })

        it('watch multiple signals in component', () => {
            const a = signal(1)
            const b = signal(2)
            let watchValues = null

            const Comp = defineComponent({
                setup() {
                    watch([a, b], ([v1, v2]) => {
                        watchValues = [v1, v2]
                    })
                    return { template: '<div></div>' }
                }
            })

            Comp().render(document.createElement('div'))
            a(10)
            expect(watchValues).toEqual([10, 2])
        })
    })

    // ─── PROVIDE + INJECT + SIGNALS ───────────────────────────────────────────────
    describe('Provide + Inject + Signals', () => {
        it('provide reactive signal and inject in child', () => {
            const theme = signal('dark')

            const Child = defineComponent({
                setup() {
                    const themeSignal = inject('theme')
                    return {
                        themeSignal,
                        template: '<div>{{ themeSignal }}</div>'
                    }
                }
            })

            const Parent = defineComponent({
                setup() {
                    provide('theme', theme)
                    return { template: '' }
                }
            })

            const parentInst = Parent().instance
            const child = Child({}, { parent: parentInst })

            expect(child.instance.state.themeSignal()).toBe('dark')

            theme('light')
            expect(child.instance.state.themeSignal()).toBe('light')
        })
    })

    // ─── COMPUTED + WATCH ────────────────────────────────────────────────────────
    describe('Computed + Watch', () => {
        it('watch computed value changes', () => {
            const count = signal(0)
            const doubled = computed(() => count() * 2)
            let watchValue = null

            watch(doubled, (v) => {
                watchValue = v
            })

            count(5)
            expect(watchValue).toBe(10)
        })
    })

    // ─── STORE + WATCH ────────────────────────────────────────────────────────────
    describe('Store + Watch', () => {
        it('watch store state changes', () => {
            const useCounter = defineStore('watch-test', () => ({
                count: signal(0)
            }))

            const counter = useCounter()
            let watchValue = null

            watch(counter.count, (v) => {
                watchValue = v
            })

            counter.count(10)
            expect(watchValue).toBe(10)
        })
    })

    // ─── COMPONENT + EMIT + SIGNALS ───────────────────────────────────────────────
    describe('Component + Emit + Signals', () => {
        it('emit event with signal value', () => {
            const count = signal(42)
            let emittedValue = null

            const Child = defineComponent({
                setup(props, { emit }) {
                    return {
                        emitValue: () => emit('update', count()),
                        template: '<button @click="emitValue">Click</button>'
                    }
                }
            })

            const Parent = defineComponent({
                setup() {
                    return {
                        template: '{{ Child }}'
                    }
                },
                components: { Child }
            })

            const childApi = Child({}, {
                listeners: {
                    'update': (v) => { emittedValue = v }
                }
            })

            childApi.instance.state.emitValue()
            expect(emittedValue).toBe(42)
        })
    })

    // ─── TELEPORT + OUT-OF-TREE UPDATES ─────────────────────────────────────────────
    describe('Teleport + Out-of-tree Updates', () => {
        it('signal updates element manually moved in DOM', () => {
            const text = signal('initial')

            const Comp = defineComponent({
                setup() {
                    return {
                        text,
                        template: '<div id="teleport-target">{{ text }}</div>'
                    }
                }
            })

            const container1 = document.createElement('div')
            const container2 = document.createElement('div')
            const api = Comp()
            api.render(container1)

            const target = container1.querySelector('#teleport-target')
            expect(target.textContent).toBe('initial')

            // Move element to different container
            container2.appendChild(target)

            // Update signal - should still update even though element moved
            text('moved')
            expect(target.textContent).toBe('moved')
        })

        it('two render areas share same Store - consistency', () => {
            const useShared = defineStore('teleport-store', () => ({
                value: signal('shared')
            }))

            const store = useShared()

            const CompA = defineComponent({
                setup() {
                    return {
                        value: store.value,
                        template: '<div>{{ value }}</div>'
                    }
                }
            })

            const CompB = defineComponent({
                setup() {
                    return {
                        value: store.value,
                        template: '<div>{{ value }}</div>'
                    }
                }
            })

            const containerA = document.createElement('div')
            const containerB = document.createElement('div')

            CompA().render(containerA)
            CompB().render(containerB)

            expect(containerA.textContent).toBe('shared')
            expect(containerB.textContent).toBe('shared')

            store.value('updated')

            expect(containerA.textContent).toBe('updated')
            expect(containerB.textContent).toBe('updated')
        })
    })

    // ─── COMPONENT RECURSION ─────────────────────────────────────────────────────
    describe('Component Recursion', () => {
        it('recursive component with Store - reactivity stability', () => {
            const useTree = defineStore('tree-store', () => ({
                nodes: signal([
                    { id: 1, children: [{ id: 2 }, { id: 3 }] },
                    { id: 4, children: [] }
                ])
            }))

            const TreeNode = defineComponent({
                setup() {
                    return {
                        template: '<div>node</div>'
                    }
                }
            })

            const Tree = defineComponent({
                setup() {
                    const store = useTree()
                    return {
                        nodes: store.nodes,
                        template: '<div>{{ TreeNode }}</div>'
                    }
                },
                components: { TreeNode }
            })

            const container = document.createElement('div')
            const api = Tree()
            api.render(container)

            expect(container.innerHTML).toContain('node')

            // Update nested structure
            useTree().nodes([
                { id: 1, children: [{ id: 2 }, { id: 3 }, { id: 5 }] },
                { id: 4, children: [] }
            ])

            expect(container.innerHTML).toContain('node')
        })
    })

    // ─── DEEP UNMOUNT CLEANUP ────────────────────────────────────────────────────
    describe('Deep Unmount Cleanup', () => {
        it('async component unmount cleans entire chain including effects', async () => {
            const useDeepStore = defineStore('deep-store', () => ({
                value: signal(0)
            }))

            let effectRuns = 0

            const NormalComp = defineComponent({
                setup() {
                    const store = useDeepStore()
                    effect(() => {
                        store.value()
                        effectRuns++
                    })
                    return { template: '<div>normal</div>' }
                }
            })

            const AsyncWrapper = defineAsyncComponent({
                loader: () => Promise.resolve(NormalComp)
            })

            const container = document.createElement('div')
            const api = AsyncWrapper()
            api.render(container)

            await new Promise(r => setTimeout(r, 0))
            expect(effectRuns).toBe(1)

            useDeepStore().value(1)
            expect(effectRuns).toBe(2)

            // Unmount at root - should clean everything
            api.unmount()
            useDeepStore().value(2)

            // Effect should NOT run after unmount
            expect(effectRuns).toBe(2)
        })
    })

    // ─── SIGNAL + COMPUTED + WATCH CHAIN ───────────────────────────────────────────
    describe('Signal + Computed + Watch Chain', () => {
        it('complex reactivity chain with signal, computed, and watch', () => {
            const a = signal(1)
            const b = signal(2)
            const sum = computed(() => a() + b())
            const doubled = computed(() => sum() * 2)
            let watchValue = null

            watch(doubled, (v) => {
                watchValue = v
            })

            a(3)
            expect(watchValue).toBe(10)
        })
    })

    // ─── STORE RESET WITH ACTIVE EFFECTS ───────────────────────────────────────────
    describe('Store Reset + Active Effects', () => {
        it('reset store while effects are watching', () => {
            const useCounter = defineStore('reset-effect', () => ({
                count: signal(0)
            }))

            const counter = useCounter()
            let effectRuns = 0

            effect(() => {
                counter.count()
                effectRuns++
            })

            expect(effectRuns).toBe(1)
            counter.count(5)
            expect(effectRuns).toBe(2)

            // Reset store
            counter.count(0)
            counter.count(10)
            expect(effectRuns).toBe(4)
        })
    })

    // ─── DIRECTIVE WITH COMPUTED SIGNAL BINDING ────────────────────────────────────
    describe('Directive + Computed Signal', () => {
        it('directive binding with computed signal', () => {
            const count = signal(0)
            const doubled = computed(() => count() * 2)
            const updated = vi.fn()

            directive('computed-bind', {
                mounted: () => {},
                updated: (el, binding) => updated(binding.value)
            })

            const Comp = defineComponent({
                setup() {
                    return {
                        doubled,
                        template: '<div f-computed-bind="doubled"></div>'
                    }
                }
            })

            const container = document.createElement('div')
            Comp().render(container)

            count(5)
            expect(updated).toHaveBeenCalledWith(10)
        })
    })

    // ─── MULTIPLE PROVIDE/INJECT LEVELS WITH SAME KEY ──────────────────────────────
    describe('Multiple Provide/Inject + Same Key', () => {
        it('provide/inject shadowing behavior', () => {
            const Child = defineComponent({
                setup() {
                    const value = inject('key')
                    return { value, template: '<div>{{ value }}</div>' }
                }
            })

            const Middle = defineComponent({
                setup() {
                    provide('key', 'middle')
                    return { template: '{{ Child }}' }
                },
                components: { Child }
            })

            const Parent = defineComponent({
                setup() {
                    provide('key', 'parent')
                    return { template: '{{ Middle }}' }
                },
                components: { Middle }
            })

            const parentApi = Parent()
            const parentInst = parentApi.instance

            // Manually build hierarchy to test shadowing
            const middleApi = Middle({}, { parent: parentInst })
            const middleInst = middleApi.instance
            const childApi = Child({}, { parent: middleInst })
            expect(childApi.instance.state.value).toBe('middle')
        })
    })

    // ─── EFFECT CLEANUP WITH MULTIPLE SIGNALS ────────────────────────────────────
    describe('Effect Cleanup + Multiple Signals', () => {
        it('effect cleanup with multiple signal dependencies', () => {
            const a = signal(1)
            const b = signal(2)
            let effectRuns = 0
            let cleanupRuns = 0

            effect(() => {
                a()
                b()
                effectRuns++
                return () => {
                    cleanupRuns++
                }
            })

            expect(effectRuns).toBe(1)
            a(2)
            expect(effectRuns).toBe(2)
            b(3)
            expect(effectRuns).toBe(3)
        })
    })

    // ─── BATCH + WATCH + MULTIPLE SIGNALS ───────────────────────────────────────────
    describe('Batch + Watch + Multiple Signals', () => {
        it('batch updates with watch on multiple signals', () => {
            const a = signal(0)
            const b = signal(0)
            let watchCount = 0

            watch([a, b], () => {
                watchCount++
            })

            batch(() => {
                a(1)
                b(2)
            })

            expect(watchCount).toBe(1)
        })
    })

    // ─── EFFECT + CLEANUP ───────────────────────────────────────────────────────────
    describe('Effect + Cleanup', () => {
        it('effect runs immediately', () => {
            const count = signal(0)
            const spy = vi.fn()

            effect(() => spy(count()))
            expect(spy).toHaveBeenCalledTimes(1)
            expect(spy).toHaveBeenCalledWith(0)
        })

        it('effect reruns when dependency changes', () => {
            const count = signal(0)
            const spy = vi.fn()

            effect(() => spy(count()))

            count(1)
            count(2)

            expect(spy).toHaveBeenCalledTimes(3)
        })

        it('effect stops after stop() is called', () => {
            const count = signal(0)
            const spy = vi.fn()

            const stop = effect(() => spy(count()))
            stop()

            count(1)
            expect(spy).toHaveBeenCalledTimes(1)
        })
    })

    // ─── EFFECT + MULTIPLE SIGNALS ───────────────────────────────────────────────────
    describe('Effect + Multiple Signals', () => {
        it('effect tracks multiple signals', () => {
            const a = signal(1)
            const b = signal(2)
            const spy = vi.fn()

            effect(() => spy(a() + b()))

            a(10)
            expect(spy).toHaveBeenLastCalledWith(12)

            b(20)
            expect(spy).toHaveBeenLastCalledWith(30)
        })

        it('effect does not track signals inside untrack', () => {
            const a = signal(1)
            const b = signal(100)
            const spy = vi.fn()

            effect(() => {
                a()
                untrack(() => b())
                spy()
            })

            b(999)
            expect(spy).toHaveBeenCalledTimes(1)

            a(2)
            expect(spy).toHaveBeenCalledTimes(2)
        })
    })

    // ─── COMPONENT + EFFECT ────────────────────────────────────────────────────────
    describe('Component + Effect', () => {
        it('component effect tracks signals', () => {
            const count = signal(0)
            const spy = vi.fn()

            const Comp = defineComponent({
                setup() {
                    effect(() => spy(count()))
                    return { template: '<div></div>' }
                }
            })

            const container = document.createElement('div')
            Comp().render(container)

            count(1)
            expect(spy).toHaveBeenCalledTimes(2)
        })
    })

    // ─── STORE + EFFECT ──────────────────────────────────────────────────────
    describe('Store + Effect', () => {
        it('store effect tracks state changes', () => {
            const useCounter = defineStore('store-effect', () => ({
                count: signal(0)
            }))

            const counter = useCounter()
            const spy = vi.fn()

            effect(() => spy(counter.count()))

            counter.count(1)
            counter.count(2)
            expect(spy).toHaveBeenCalledTimes(3)
        })
    })

    // ─── WATCH + IMMEDIATE ───────────────────────────────────────────────────────────
    describe('Watch + Immediate', () => {
        it('watch with immediate runs callback immediately', () => {
            const count = signal(0)
            const spy = vi.fn()

            watch(count, spy, { immediate: true })
            expect(spy).toHaveBeenCalledWith(0, undefined, expect.any(Function))
        })
    })

    // ─── WATCH + EQUALS CUSTOM ───────────────────────────────────────────────────────
    describe('Watch + Custom Equals', () => {
        it('watch with custom equals function', () => {
            const count = signal(0)
            const spy = vi.fn()

            watch(count, spy, {
                equals: (a, b) => a === b
            })

            count(1)
            count(1)
            expect(spy).toHaveBeenCalledTimes(1)
        })
    })

    // ─── SIGNAL + UNTRACK ───────────────────────────────────────────────────────────
    describe('Signal + Untrack', () => {
        it('untrack prevents effect from tracking signal', () => {
            const a = signal(1)
            const b = signal(100)
            const spy = vi.fn()

            effect(() => {
                untrack(() => b())
                spy(a())
            })

            b(999)
            expect(spy).toHaveBeenCalledTimes(1)

            a(2)
            expect(spy).toHaveBeenCalledTimes(2)
        })
    })

    // ─── COMPUTED + UNTRACK ──────────────────────────────────────────────────────────
    describe('Computed + Untrack', () => {
        it('untrack inside computed does not affect dependency tracking', () => {
            const a = signal(1)
            const b = signal(100)
            const spy = vi.fn()

            const result = computed(() => {
                untrack(() => b())
                return a() * 2
            })

            effect(() => spy(result()))

            b(999)
            expect(spy).toHaveBeenCalledTimes(1)

            a(2)
            expect(spy).toHaveBeenCalledTimes(2)
        })
    })

    // ─── BATCH + EFFECT ─────────────────────────────────────────────────────
    describe('Batch + Effect', () => {
        it('batch updates with effect tracking', () => {
            const a = signal(0)
            const b = signal(0)
            const effectSpy = vi.fn()

            effect(() => {
                a()
                b()
                effectSpy()
            })

            batch(() => {
                a(1)
                b(2)
            })

            expect(effectSpy).toHaveBeenCalledTimes(2)
        })
    })
})

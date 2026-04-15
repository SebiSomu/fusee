// communication.test.js
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, provide, inject } from '../core/component.js'
import { mountTemplate } from '../core/compiler.js'
import { signal } from '../core/signal.js'

describe('Fusée Communication: Emit & DI', () => {

    // ─── EMIT TESTS ──────────────────────────────────────────────────
    describe('emit()', () => {
        it('should call the parent listener when child emits', () => {
            const handler = vi.fn()

            // Define child component that emits an event
            const Child = defineComponent({
                setup(props, { emit }) {
                    return {
                        trigger: () => emit('custom-event', 'hello from below'),
                        template: '<button @click="trigger">Click</button>'
                    }
                }
            })

            // Container for mounting
            const container = document.createElement('div')

            // Simulate what the compiler does when it sees @custom-event="handler"
            const listeners = {
                'custom-event': handler
            }

            const childApi = Child({}, { listeners })
            childApi.render(container)

            // Attach to document body for delegated events to work
            document.body.appendChild(container)

            const btn = container.querySelector('button')
            btn.click()

            expect(handler).toHaveBeenCalledWith('hello from below')

            container.remove()
        })

        it('should execute inline expressions in parent context via emit', () => {
            const count = signal(0)
            
            const Child = defineComponent({
                setup(props, { emit }) {
                    return {
                        go: () => emit('update'),
                        template: '<div></div>'
                    }
                }
            })

            // Simulate a listener that is actually an inline expression (compiler.js behavior)
            const listeners = {
                'update': () => { count(count() + 1) }
            }

            const childApi = Child({}, { listeners })
            childApi.instance.state.go()

            expect(count()).toBe(1)
        })
    });

    // ─── INJECT / PROVIDE TESTS ──────────────────────────────────────
    describe('provide/inject', () => {
        it('should allow a child to inject values from a parent', () => {
            const key = 'theme-color'
            const value = 'blue'

            const Child = defineComponent({
                setup() {
                    const theme = inject(key)
                    return { 
                        theme,
                        template: '<div>{{ theme }}</div>'
                    }
                }
            })

            const Parent = defineComponent({
                setup() {
                    provide(key, value)
                    return {
                        template: '{{ Child }}'
                    }
                },
                components: { Child }
            })

            // Manually mount hierarchy to test the _parent link
            const parentApi = Parent()
            const parentInstance = parentApi.instance
            
            // Simulate what bindComponents does: sets parent
            const childApi = Child({}, { parent: parentInstance })
            const childState = childApi.instance.state

            expect(childState.theme).toBe('blue')
        })

        it('should work through multiple levels (deep injection)', () => {
            const GrandParent = defineComponent({
                setup() {
                    provide('secret', '1234')
                    return { template: '{{ Parent }}' }
                }
            })

            const Parent = defineComponent({
                setup() { return { template: '{{ Child }}' } }
            })

            const Child = defineComponent({
                setup() {
                    const secret = inject('secret')
                    return { secret, template: '...' }
                }
            })

            const gpInst = GrandParent().instance
            const pInst = Parent({}, { parent: gpInst }).instance
            const childApi = Child({}, { parent: pInst })
            
            expect(childApi.instance.state.secret).toBe('1234')
        })

        it('should return null if key is not found in ancestors', () => {
            const Child = defineComponent({
                setup() {
                    const missing = inject('non-existent')
                    return { missing, template: '' }
                }
            })

            const childApi = Child({}, { parent: { _provides: {} } })
            expect(childApi.instance.state.missing).toBeNull()
        })

        it('should react to reactive values provided in a parent', () => {
            const theme = signal('light')
            
            const Child = defineComponent({
                setup() {
                    const currentTheme = inject('theme')
                    return { currentTheme, template: '' }
                }
            })

            const Parent = defineComponent({
                setup() {
                    provide('theme', theme)
                    return { template: '' }
                }
            })

            const pInst = Parent().instance
            const cApi = Child({}, { parent: pInst })
            const cState = cApi.instance.state

            expect(cState.currentTheme()).toBe('light')
            theme('dark')
            expect(cState.currentTheme()).toBe('dark')
        })
    })
})
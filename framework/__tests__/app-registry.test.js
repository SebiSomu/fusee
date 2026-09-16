// app-registry.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp, App } from '../core/app-registry.js'
import { defineComponent, provide, inject } from '../core/component.js'
import { defineCompilerPlugin, defineServerPlugin, defineDevToolsPlugin, defineRuntimeAdapter, defineFuseePlugin } from '../core/plugins.js'

describe('App Registry & Plugin Architecture', () => {
    let container

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'app'
        document.body.appendChild(container)
        return () => {
            document.body.innerHTML = ''
        }
    })

    // ─────────────────────────────────────────────────────────────
    // 1. Plugin System (app.use)
    // ─────────────────────────────────────────────────────────────
    describe('app.use() Plugin System', () => {
        it('installs object-based plugins with install() method', () => {
            const pluginFn = vi.fn()
            const plugin = { install: pluginFn }
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            app.use(plugin, { optionA: true })

            expect(pluginFn).toHaveBeenCalledTimes(1)
            expect(pluginFn).toHaveBeenCalledWith(app, { optionA: true })
        })

        it('installs functional plugins', () => {
            const plugin = vi.fn()
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            app.use(plugin, 'config-value')

            expect(plugin).toHaveBeenCalledTimes(1)
            expect(plugin).toHaveBeenCalledWith(app, 'config-value')
        })

        it('prevents duplicate plugin installation', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const pluginFn = vi.fn()
            const plugin = { install: pluginFn }
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            app.use(plugin)
            app.use(plugin)

            expect(pluginFn).toHaveBeenCalledTimes(1)
            expect(warnSpy).toHaveBeenCalledWith('Plugin has already been installed.')
            warnSpy.mockRestore()
        })

        it('handles invalid plugin definitions gracefully', () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            app.use(null)

            expect(errorSpy).toHaveBeenCalledWith('Plugin must expose an `install` function or be a function itself.')
            errorSpy.mockRestore()
        })
    })

    // ─────────────────────────────────────────────────────────────
    // 2. Scoped Component Tree Hierarchy & Provides
    // ─────────────────────────────────────────────────────────────
    describe('Scoped Provides & Prototypal Hierarchy', () => {
        it('passes app-level provides down to root component', () => {
            let injectedValue = null

            const Root = defineComponent({
                setup() {
                    injectedValue = inject('appTheme')
                    return { template: '<div>Root</div>' }
                }
            })

            const app = createApp(Root)
            app.provide('appTheme', 'dark')
            app.mount(container)

            expect(injectedValue).toBe('dark')
        })

        it('supports prototypal inheritance (Object.create) down the component tree', () => {
            let childValue = null
            let grandchildValue = null

            const Grandchild = defineComponent({
                setup() {
                    grandchildValue = inject('globalConfig')
                    return { template: '<span>Grandchild</span>' }
                }
            })

            const Child = defineComponent({
                components: { Grandchild },
                setup() {
                    childValue = inject('globalConfig')
                    return { template: '<div><Grandchild /></div>' }
                }
            })

            const Root = defineComponent({
                components: { Child },
                setup() {
                    return { template: '<div><Child /></div>' }
                }
            })

            const app = createApp(Root)
            app.provide('globalConfig', { env: 'production' })
            app.mount(container)

            expect(childValue).toEqual({ env: 'production' })
            expect(grandchildValue).toEqual({ env: 'production' })
        })

        it('allows child to override provide key without mutating ancestor scopes', () => {
            let rootInjected = null
            let childInjected = null
            let grandchildInjected = null

            const Grandchild = defineComponent({
                setup() {
                    grandchildInjected = inject('theme')
                    return { template: '<span>Grandchild</span>' }
                }
            })

            const Child = defineComponent({
                components: { Grandchild },
                setup() {
                    provide('theme', 'child-light')
                    childInjected = inject('theme')
                    return { template: '<div><Grandchild /></div>' }
                }
            })

            const Root = defineComponent({
                components: { Child },
                setup() {
                    provide('theme', 'root-dark')
                    rootInjected = inject('theme')
                    return { template: '<div><Child /></div>' }
                }
            })

            const app = createApp(Root)
            app.mount(container)

            expect(rootInjected).toBe('root-dark')
            expect(childInjected).toBe('child-light')
            expect(grandchildInjected).toBe('child-light')
        })
    })

    // ─────────────────────────────────────────────────────────────
    // 3. Global Component & Directive Registration
    // ─────────────────────────────────────────────────────────────
    describe('Global Component & Directive Registration', () => {
        it('registers and retrieves global components', () => {
            const GlobalButton = defineComponent({
                setup() { return { template: '<button>Click Me</button>' } }
            })

            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))
            app.component('GlobalButton', GlobalButton)

            expect(app.component('GlobalButton')).toBe(GlobalButton)
        })

        it('automatically passes registered global components to descendant components', () => {
            const GlobalBadge = defineComponent({
                setup() { return { template: '<span class="badge">Badge</span>' } }
            })

            const Root = defineComponent({
                setup(props, { slots }) {
                    return { template: '<div><GlobalBadge /></div>' }
                }
            })

            const app = createApp(Root)
            app.component('GlobalBadge', GlobalBadge)
            app.mount(container)

            expect(container.innerHTML).toContain('Badge')
        })

        it('registers and retrieves global directives', () => {
            const myDirective = { mounted: vi.fn() }
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            app.directive('focus', myDirective)

            expect(app.directive('focus')).toBe(myDirective)
        })
    })

    // ─────────────────────────────────────────────────────────────
    // 4. Lifecycle Middleware Hooks
    // ─────────────────────────────────────────────────────────────
    describe('Lifecycle Middleware Hooks', () => {
        it('executes hooks in sequence during mount and unmount lifecycles', () => {
            const log = []

            const Root = defineComponent({
                setup() { return { template: '<div>Root</div>' } }
            })

            const app = createApp(Root)

            app.beforeMount(() => log.push('beforeMount'))
               .mounted(() => log.push('mounted'))
               .beforeUnmount(() => log.push('beforeUnmount'))
               .unmounted(() => log.push('unmounted'))
               .afterUnmount(() => log.push('afterUnmount'))

            expect(log).toEqual([])

            app.mount(container)
            expect(log).toEqual(['beforeMount', 'mounted'])

            app.unmount()
            expect(log).toEqual(['beforeMount', 'mounted', 'beforeUnmount', 'unmounted', 'afterUnmount'])
        })

        it('supports generic hook() method for custom channels', () => {
            const customHookFn = vi.fn()
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            app.hook('customEvent', customHookFn)
            app._hooks.customEvent.forEach(fn => fn(app))

            expect(customHookFn).toHaveBeenCalledWith(app)
        })
    })

    // ─────────────────────────────────────────────────────────────
    // 5. DOM Mounting & Teardown
    // ─────────────────────────────────────────────────────────────
    describe('DOM Mounting & Teardown', () => {
        it('mounts into a selector string or Element container', () => {
            const Root = defineComponent({
                setup() { return { template: '<h1>Hello World</h1>' } }
            })

            const app = createApp(Root)
            app.mount('#app')

            expect(container.textContent).toBe('Hello World')
        })

        it('throws an error if target container element does not exist', () => {
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            expect(() => app.mount('#non-existent-node')).toThrow('Target container #non-existent-node not found.')
        })

        it('clears container on unmount', () => {
            const Root = defineComponent({
                setup() { return { template: '<h1>Content</h1>' } }
            })

            const app = createApp(Root)
            app.mount(container)
            expect(container.innerHTML).not.toBe('')

            app.unmount()
            expect(container.innerHTML).toBe('')
        })
    })

    // ─────────────────────────────────────────────────────────────
    // 6. App Configuration & globalProperties
    // ─────────────────────────────────────────────────────────────
    describe('App Configuration', () => {
        it('exposes globalProperties and error/warn handler contracts', () => {
            const app = createApp(defineComponent({ setup: () => ({ template: '' }) }))

            app.config.globalProperties.$http = { get: () => {} }
            app.config.errorHandler = vi.fn()
            app.config.warnHandler = vi.fn()

            expect(app.config.globalProperties.$http).toBeDefined()
            
            // Trigger duplicate plugin warning to test custom warnHandler
            const p = () => {}
            app.use(p)
            app.use(p)

            expect(app.config.warnHandler).toHaveBeenCalledWith('Plugin has already been installed.')
        })
    })

    // ─────────────────────────────────────────────────────────────
    // 7. Multi-Domain Plugin Architecture (plugins.js)
    // ─────────────────────────────────────────────────────────────
    describe('Multi-Domain Plugin Definition Utilities', () => {
        it('defines a compiler plugin with correct domain tag', () => {
            const plugin = defineCompilerPlugin({
                name: 'my-compiler-plugin',
                transform(code, id) { return code }
            })

            expect(plugin.__domain).toBe('compiler')
            expect(plugin.name).toBe('my-compiler-plugin')
            expect(typeof plugin.transform).toBe('function')
        })

        it('defines a server plugin with middleware and SSR hooks', () => {
            const plugin = defineServerPlugin({
                name: 'my-server-plugin',
                middleware: [(req, res, next) => next()]
            })

            expect(plugin.__domain).toBe('server')
            expect(plugin.name).toBe('my-server-plugin')
            expect(plugin.middleware).toHaveLength(1)
        })

        it('defines a devtools plugin with panel metadata', () => {
            const plugin = defineDevToolsPlugin({
                name: 'my-devtools-plugin',
                panels: [{ title: 'State Inspector' }]
            })

            expect(plugin.__domain).toBe('devtools')
            expect(plugin.name).toBe('my-devtools-plugin')
            expect(plugin.panels).toEqual([{ title: 'State Inspector' }])
        })

        it('defines a runtime adapter', () => {
            const adapter = defineRuntimeAdapter({
                name: 'dom-adapter',
                createElement: (tag) => document.createElement(tag)
            })

            expect(adapter.__domain).toBe('runtime')
            expect(adapter.name).toBe('dom-adapter')
        })

        it('creates a unified Fusee plugin isolating all domain sub-plugins', () => {
            const fuseePlugin = defineFuseePlugin({
                name: 'fullstack-framework-plugin',
                compiler: {
                    transform(code) { return code }
                },
                server: {
                    middleware: []
                },
                devtools: {
                    panels: []
                },
                runtime: {
                    platform: 'browser'
                }
            })

            expect(fuseePlugin.name).toBe('fullstack-framework-plugin')
            expect(fuseePlugin.compiler.__domain).toBe('compiler')
            expect(fuseePlugin.compiler.name).toBe('fullstack-framework-plugin-compiler')
            expect(fuseePlugin.server.__domain).toBe('server')
            expect(fuseePlugin.server.name).toBe('fullstack-framework-plugin-server')
            expect(fuseePlugin.devtools.__domain).toBe('devtools')
            expect(fuseePlugin.devtools.name).toBe('fullstack-framework-plugin-devtools')
            expect(fuseePlugin.runtime.__domain).toBe('runtime')
            expect(fuseePlugin.runtime.name).toBe('fullstack-framework-plugin-runtime')
        })
    })
})
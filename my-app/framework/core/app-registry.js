import { rootInjector } from './di.js'

export function createApp(rootComponent) {
    const app = {
        _provides: Object.create(null),
        _components: Object.create(null),
        _directives: Object.create(null),
        _plugins: new Set(),

        _hooks: {
            beforeMount: [],
            mounted: [],
            beforeUnmount: [],
            unmounted: [],
            afterUnmount: []
        },

        config: {
            globalProperties: {},
            errorHandler: null,
            warnHandler: null
        },

        _rootApi: null,

        use(plugin, ...options) {
            if (this._plugins.has(plugin)) {
                const warnMsg = 'Plugin has already been installed.'

                if (typeof this.config.warnHandler === 'function') {
                    this.config.warnHandler(warnMsg)
                } else {
                    console.warn(warnMsg)
                }

                return this
            }

            if (
                !plugin ||
                (
                    typeof plugin !== 'function' &&
                    typeof plugin.install !== 'function'
                )
            ) {
                console.error(
                    'Plugin must expose an `install` function or be a function itself.'
                )

                return this
            }

            this._plugins.add(plugin)

            if (typeof plugin.install === 'function') {
                plugin.install(this, ...options)
            } else if (typeof plugin === 'function') {
                plugin(this, ...options)
            }

            return this
        },

        provide(key, value) {
            this._provides[key] = value

            return this
        },

        component(name, comp) {
            if (!comp) {
                return this._components[name]
            }

            this._components[name] = comp

            return this
        },

        directive(name, dir) {
            if (!dir) {
                return this._directives[name]
            }

            this._directives[name] = dir

            return this
        },

        hook(name, fn) {
            if (!this._hooks[name]) {
                this._hooks[name] = []
            }

            this._hooks[name].push(fn)

            return this
        },

        beforeMount(fn) {
            return this.hook('beforeMount', fn)
        },

        mounted(fn) {
            return this.hook('mounted', fn)
        },

        beforeUnmount(fn) {
            return this.hook('beforeUnmount', fn)
        },

        unmounted(fn) {
            return this.hook('unmounted', fn)
        },

        afterUnmount(fn) {
            return this.hook('afterUnmount', fn)
        },

        mount(target) {
            const container = typeof target === 'string'
                ? document.querySelector(target)
                : target

            if (!container) {
                throw new Error(
                    `Target container ${target} not found.`
                )
            }

            const appParentContext = {
                provides: this._provides,
                _provides: this._provides,
                _app: this,
                _components: this._components,
                _injector: rootInjector
            }

            this._hooks.beforeMount.forEach(fn => fn(this))

            this._rootApi = rootComponent(
                {},
                {
                    parent: appParentContext
                }
            )

            this._rootApi.render(container)

            this._hooks.mounted.forEach(fn => fn(this))

            return this._rootApi.instance
        },

        unmount() {
            if (!this._rootApi) {
                return
            }

            this._hooks.beforeUnmount.forEach(fn => fn(this))

            this._rootApi.unmount()

            this._hooks.unmounted.forEach(fn => fn(this))
            this._hooks.afterUnmount.forEach(fn => fn(this))

            this._rootApi = null
        }
    }

    return app
}
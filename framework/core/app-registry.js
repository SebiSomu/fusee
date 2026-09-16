export class App {
    constructor(rootComponent, rootProps = {}) {
        this.rootComponent = rootComponent;
        this.rootProps = rootProps;

        this._installedPlugins = new Set();
        this._provides = Object.create(null);
        this._components = Object.create(null);
        this._directives = Object.create(null);
        
        this._hooks = {
            beforeMount: [],
            mounted: [],
            beforeUnmount: [],
            unmounted: []
        };

        this.config = {
            globalProperties: {},
            errorHandler: null,
            warnHandler: null
        };

        this._rootInstance = null;
        this._container = null;
    }

    /**
     * Installs a plugin into the app.
     */
    use(plugin, ...options) {
        if (this._installedPlugins.has(plugin)) {
            if (this.config.warnHandler) {
                this.config.warnHandler('Plugin has already been installed.');
            } else {
                console.warn('Plugin has already been installed.');
            }
            return this;
        }

        this._installedPlugins.add(plugin);

        if (plugin && typeof plugin.install === 'function') {
            plugin.install(this, ...options);
        } else if (typeof plugin === 'function') {
            plugin(this, ...options);
        } else {
            const msg = 'Plugin must expose an `install` function or be a function itself.';
            if (this.config.errorHandler) {
                this.config.errorHandler(new Error(msg));
            } else {
                console.error(msg);
            }
        }

        return this;
    }

    /**
     * Sets root-level provides inherited by the root component and all descendants.
     */
    provide(key, value) {
        this._provides[key] = value;
        return this;
    }

    /**
     * Registers or retrieves global components.
     */
    component(name, definition) {
        if (!definition) {
            return this._components[name];
        }
        this._components[name] = definition;
        return this;
    }

    /**
     * Registers or retrieves global directives.
     */
    directive(name, definition) {
        if (!definition) {
            return this._directives[name];
        }
        this._directives[name] = definition;
        return this;
    }

    /**
     * Registers a generic lifecycle or middleware hook.
     */
    hook(name, fn) {
        if (!this._hooks[name]) {
            this._hooks[name] = [];
        }
        this._hooks[name].push(fn);
        return this;
    }

    beforeMount(fn) { return this.hook('beforeMount', fn); }
    mounted(fn) { return this.hook('mounted', fn); }
    beforeUnmount(fn) { return this.hook('beforeUnmount', fn); }
    unmounted(fn) { return this.hook('unmounted', fn); }
    afterUnmount(fn) { return this.hook('unmounted', fn); }

    /**
     * Mounts the application to the provided DOM selector or element.
     */
    mount(selector) {
        const container = typeof selector === 'string' 
            ? document.querySelector(selector) 
            : selector;

        if (!container) {
            throw new Error(`Target container ${selector} not found.`);
        }

        this._container = container;

        for (const fn of this._hooks.beforeMount) {
            fn(this);
        }

        const rootContext = {
            _app: this,
            _components: this._components,
            provides: this._provides,
            _injector: null
        };

        this._rootInstance = this.rootComponent(this.rootProps, { parent: rootContext });
        this._rootInstance.render(container);

        for (const fn of this._hooks.mounted) {
            fn(this);
        }

        return this._rootInstance;
    }

    /**
     * Unmounts the application and cleans up the DOM.
     */
    unmount() {
        if (!this._rootInstance) return;

        for (const fn of this._hooks.beforeUnmount) {
            fn(this);
        }
        this._rootInstance.unmount();

        if (this._container) {
            this._container.innerHTML = '';
        }
        for (const fn of this._hooks.unmounted) {
            fn(this);
        }
        this._rootInstance = null;
        this._container = null;
    }
}

export function createApp(rootComponent, rootProps = {}) {
    return new App(rootComponent, rootProps);
}
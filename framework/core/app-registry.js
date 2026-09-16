export class App {
    constructor(rootComponent, rootProps = {}) {
      this.rootComponent = rootComponent;
      this.rootProps = rootProps;
      this._installedPlugins = new Set();
      this._provides = Object.create(null);
      this.config = { globalProperties: {} };
    }

  /**
   * Registers a plugin into the framework app instance.
   */
    use(plugin, ...options) {
      if (this._installedPlugins.has(plugin)) {
          console.warn('Plugin has already been installed.');
          return this;
      }

      if (typeof plugin.install === 'function') {
          this._installedPlugins.add(plugin);
          plugin.install(this, ...options);
      } else if (typeof plugin === 'function') {
          this._installedPlugins.add(plugin);
          plugin(this, ...options);
      } else {
          console.error('Plugin must expose an `install` function or be a function itself.');
      }
      return this;
    }

  /**
   * Provides a value that can be injected into child components/contexts.
   */
    provide(key, value) {
      this._provides[key] = value;
      return this;
    }

    mount(selector) {
      const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
      
      if (!container) {
          throw new Error(`Target container ${selector} not found.`);
      }

      this.render(container);
      return this;
    }

    render(container) {
        container.textContent = 'App Mounted';
    }
}

export function createApp(rootComponent, rootProps) {
    return new App(rootComponent, rootProps);
}
// ─── Component System ─────────────────────────────────────────────────────────
import { effect } from './signal.js'

// Lifecycle context — set while setup() runs
let currentInstance = null

export function onMount(fn) {
  if (currentInstance) currentInstance._mountHooks.push(fn)
}

export function onUnmount(fn) {
  if (currentInstance) currentInstance._unmountHooks.push(fn)
}

export function defineComponent(options) {
  return function ComponentFactory(props = {}) {
    const instance = {
      props,
      _mountHooks: [],
      _unmountHooks: [],
      _effects: [],
      _element: null,
    }

    // Run setup() with lifecycle context active
    currentInstance = instance
    const result = options.setup(props)
    currentInstance = null

    // Validate props defined in component
    const allowedProps = options.props || []
    for (const key of Object.keys(props)) {
      if (!allowedProps.includes(key)) {
        console.warn(`[framework] Unknown prop "${key}" passed to component.`)
      }
    }

    // ── Template rendering ───────────────────────────────────────────────────
    function render(container) {
      instance._element = container

      const e = effect(() => {
        const html = resolveTemplate(result.template, result, options.components || {})
        container.innerHTML = html
        bindEvents(container, result)
        bindComponents(container, options.components || {})
      })

      instance._effects.push(e)

      // Run mount hooks after first render
      for (const hook of instance._mountHooks) hook()

      return instance
    }

    // ── Unmount ──────────────────────────────────────────────────────────────
    function unmount() {
      for (const hook of instance._unmountHooks) hook()
      // Clean up all reactive effects
      for (const e of instance._effects) {
        for (const dep of e.deps) dep.delete(e)
        e.deps.clear()
      }
      if (instance._element) instance._element.innerHTML = ''
    }

    return { render, unmount, instance }
  }
}

// ── Template resolver ─────────────────────────────────────────────────────────
// Replaces {{ expr }} with evaluated values from the component result object.
function resolveTemplate(template, context, components) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (key in components) {
      // Nested component: {{ Counter }} → render component placeholder
      return `<div data-component="${key}"></div>`
    }
    const val = context[key]
    if (typeof val === 'function') {
      // Could be a signal — call it to get value
      try { return val() } catch { return '' }
    }
    return val ?? ''
  })
}

// ── Event binding ─────────────────────────────────────────────────────────────
// Finds all elements with @event attributes and attaches listeners.
// Re-runs after every template re-render (innerHTML wipe clears old listeners).
function bindEvents(container, context) {
  const all = container.querySelectorAll('*')
  for (const el of all) {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('@')) {
        const eventName = attr.name.slice(1)          // @click → click
        const handlerName = attr.value                 // "increment"
        const handler = context[handlerName]
        if (typeof handler === 'function') {
          el.removeAttribute(attr.name)
          el.addEventListener(eventName, handler)
        }
      }
    }
  }
}

// ── Nested component mounting ─────────────────────────────────────────────────
// Finds data-component placeholders and mounts child components inside them.
function bindComponents(container, components) {
  const placeholders = container.querySelectorAll('[data-component]')
  for (const placeholder of placeholders) {
    const name = placeholder.dataset.component
    const ComponentFn = components[name]
    if (ComponentFn) {
      // Read props from data-prop-* attributes if present
      const props = {}
      for (const attr of [...placeholder.attributes]) {
        if (attr.name.startsWith('data-prop-')) {
          props[attr.name.slice(10)] = attr.value
        }
      }
      const child = ComponentFn(props)
      child.render(placeholder)
    }
  }
}

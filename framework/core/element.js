import { signal, effect, runDetached } from './signal.js'
import { defineComponent, getCurrentInstance, setCurrentInstance, parseSlots } from './component.js'
import { installDelegationRoot } from './event-delegation.js'

const CSS_RESULT = Symbol.for('fusee.cssResult')

/** Wraps CSS text so it can be shared by every instance of an element as one stylesheet. */
function createCSSResult(cssText) {
    let sheet
    return {
        [CSS_RESULT]: true,
        cssText,
        get styleSheet() {
            if (sheet === undefined) {
                sheet = supportsAdoptedStyleSheets() ? new CSSStyleSheet() : null
                sheet?.replaceSync(cssText)
            }
            return sheet
        },
        toString() {
            return cssText
        }
    }
}

/** Reports whether a value was created by css`` or unsafeCSS(). */
function isCSSResult(value) {
    return !!(value && value[CSS_RESULT])
}

/**
 * Tagged template for element styles. Interpolations must be other css`` results or
 * numbers, so untrusted strings cannot inject rules; use unsafeCSS() to opt out.
 */
export function css(strings, ...values) {
    let cssText = strings[0]
    for (let i = 0; i < values.length; i++) {
        const value = values[i]
        if (isCSSResult(value)) cssText += value.cssText
        else if (typeof value === 'number') cssText += value
        else throw new TypeError(`[fusée] css\`\` only accepts css\`\` results or numbers, got ${typeof value}. Use unsafeCSS() for trusted strings.`)
        cssText += strings[i + 1]
    }
    return createCSSResult(cssText)
}

/** Marks a trusted string as CSS so it can be used in styles or css`` interpolations. */
export function unsafeCSS(value) {
    return createCSSResult(String(value))
}

/** Reports whether shadow roots can share constructed stylesheets in this environment. */
function supportsAdoptedStyleSheets() {
    return typeof ShadowRoot !== 'undefined'
        && 'adoptedStyleSheets' in ShadowRoot.prototype
        && typeof CSSStyleSheet !== 'undefined'
        && typeof CSSStyleSheet.prototype.replaceSync === 'function'
}

/** Flattens the styles option into a list of css results. */
function normalizeStyles(styles) {
    if (!styles) return []
    const list = Array.isArray(styles) ? styles.flat(Infinity) : [styles]
    return list.filter(Boolean).map(s => isCSSResult(s) ? s : unsafeCSS(s))
}

/** Applies styles to a shadow root, using adoptedStyleSheets or <style> elements as fallback. */
function applyShadowStyles(root, styles) {
    if (styles.length === 0) return
    if (supportsAdoptedStyleSheets()) {
        root.adoptedStyleSheets = styles.map(s => s.styleSheet)
        return
    }
    const fragment = document.createDocumentFragment()
    for (const style of styles) {
        const el = document.createElement('style')
        el.textContent = style.cssText
        fragment.appendChild(el)
    }
    root.prepend(fragment)
}

/** Light-DOM elements cannot scope styles, so they are added to the document once per tag. */
function applyDocumentStyles(tagName, styles) {
    if (styles.length === 0) return
    if (document.head.querySelector(`style[data-fusee-element="${tagName}"]`)) return
    const el = document.createElement('style')
    el.setAttribute('data-fusee-element', tagName)
    el.textContent = styles.map(s => s.cssText).join('\n')
    document.head.appendChild(el)
}

/** Converts a camelCase prop name to its default kebab-case attribute name. */
function toAttributeName(name) {
    return name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
}

/** Converts attribute strings to typed prop values and back, following the prop's type. */
const DEFAULT_CONVERTER = {
    fromAttribute(value, type) {
        if (type === Boolean) return value !== null
        if (value === null) return undefined
        if (type === Number) return value === '' ? undefined : Number(value)
        if (type === Object || type === Array) {
            try {
                return JSON.parse(value)
            } catch (e) {
                console.warn(`[fusée] Could not parse attribute value as JSON: "${value}"`)
                return undefined
            }
        }
        return value
    },
    toAttribute(value, type) {
        if (type === Boolean) return value ? '' : null
        if (value === null || value === undefined) return null
        if (type === Object || type === Array) return JSON.stringify(value)
        return String(value)
    }
}

/** Normalizes the props option (array of names or config object) into per-prop definitions. */
function normalizeProps(props) {
    const defs = new Map()
    if (!props) return defs

    const entries = Array.isArray(props)
        ? props.map(name => [name, {}])
        : Object.entries(props).map(([name, config]) =>
            [name, typeof config === 'function' ? { type: config } : (config || {})])

    for (const [name, config] of entries) {
        const attribute = config.attribute === false
            ? null
            : (typeof config.attribute === 'string' ? config.attribute : toAttributeName(name))

        defs.set(name, {
            name,
            type: config.type,
            attribute,
            reflect: !!config.reflect && attribute !== null,
            required: !!config.required,
            default: config.default,
            converter: { ...DEFAULT_CONVERTER, ...(config.converter || {}) }
        })
    }

    return defs
}

/** Resolves a prop's default value, calling factory defaults once per instance. */
function resolveDefault(def) {
    return typeof def.default === 'function' && def.type !== Function ? def.default() : def.default
}

/** Normalizes the shadow option into attachShadow() options, or null for light DOM. */
function normalizeShadow(shadow) {
    if (shadow === false) return null
    if (shadow === undefined || shadow === true) return { mode: 'open' }
    if (typeof shadow === 'string') return { mode: shadow }
    return { mode: 'open', ...shadow }
}

/**
 * Defines a native custom element backed by a fusée component. Props become reactive
 * properties on the element (synced with attributes), the template renders into a
 * shadow root, and emit() dispatches DOM CustomEvents from the host.
 */
export function defineElement(tagName, options = {}) {
    if (typeof customElements === 'undefined') return null

    const existing = customElements.get(tagName)
    if (existing) {
        console.warn(`[fusée] Custom element "${tagName}" is already defined`)
        return existing
    }

    const { props, styles, shadow, setup, ...componentOptions } = options
    const propDefs = normalizeProps(props)
    const shadowInit = normalizeShadow(shadow)
    const styleList = normalizeStyles(styles)
    const attributeToProp = new Map()
    for (const def of propDefs.values()) {
        if (def.attribute) attributeToProp.set(def.attribute, def)
    }

    class FuseeElement extends HTMLElement {
        static get observedAttributes() {
            return [...attributeToProp.keys()]
        }

        constructor() {
            super()
            this.__fuSignals = new Map()
            this.__fuReflecting = null
            this.__fuApi = null
            this.__fuTeardown = null
            this.__fuCleanups = []
            this.__fuSlots = null
            this.__fuRoot = shadowInit? (this.shadowRoot || this.attachShadow(shadowInit)) : this

            for (const def of propDefs.values()) {
                this.__fuSignals.set(def.name, signal(resolveDefault(def)))
            }

            this.__fuUpgradeProperties()
        }

        __fuUpgradeProperties() {
            for (const key of Object.keys(this)) {
                if (key.startsWith('__fu')) continue
                const lower = key.toLowerCase()
                const def = propDefs.get(key)
                    || [...propDefs.values()].find(d => d.name.toLowerCase() === lower)
                if (!def) continue
                const value = this[key]
                delete this[key]
                this[def.name] = value
            }
        }

        attributeChangedCallback(attrName, oldValue, newValue) {
            if (oldValue === newValue || this.__fuReflecting === attrName) return
            const def = attributeToProp.get(attrName)
            if (!def) return
            const converted = def.converter.fromAttribute(newValue, def.type)
            this.__fuSignals.get(def.name)(converted === undefined ? resolveDefault(def) : converted)
        }

        connectedCallback() {
            if (this.__fuTeardown) {
                this.__fuTeardown = null
                return
            }
            if (this.__fuApi) return

            const prevInstance = getCurrentInstance()
            setCurrentInstance(null)
            try {
                runDetached(() => this.__fuMount())
            } finally {
                setCurrentInstance(prevInstance)
            }
        }

        disconnectedCallback() {
            if (!this.__fuApi) return
            const token = {}
            this.__fuTeardown = token
            queueMicrotask(() => {
                if (this.__fuTeardown !== token) return
                this.__fuTeardown = null
                if (!this.isConnected) this.__fuUnmount()
            })
        }

        __fuMount() {
            const host = this
            const root = this.__fuRoot

            for (const def of propDefs.values()) {
                if (def.required && this.__fuSignals.get(def.name)() === undefined) {
                    console.error(`[fusée] <${tagName}>: required prop "${def.name}" is missing`)
                }
            }

            const propsView = {}
            for (const def of propDefs.values()) {
                const sig = this.__fuSignals.get(def.name)
                Object.defineProperty(propsView, def.name, { get: () => sig(), enumerable: true })
            }

            const listeners = new Proxy({}, {
                get(_, eventName) {
                    if (typeof eventName !== 'string') return undefined
                    return (...args) => host.dispatchEvent(new CustomEvent(eventName, {
                        detail: args.length > 1 ? args : args[0],
                        bubbles: true,
                        composed: true,
                        cancelable: true
                    }))
                }
            })

            if (!shadowInit && this.__fuSlots === null) {
                this.__fuSlots = parseSlots(this.innerHTML)
            }

            const factory = defineComponent({
                ...componentOptions,
                _nativeSlots: !!shadowInit,
                setup: (setupProps, ctx) => setup
                    ? setup(setupProps, { ...ctx, host, shadowRoot: shadowInit ? root : null })
                    : {}
            })

            if (shadowInit?.mode === 'closed') {
                this.__fuCleanups.push(installDelegationRoot(root))
            }

            for (const def of propDefs.values()) {
                if (!def.reflect) continue
                const sig = this.__fuSignals.get(def.name)
                this.__fuCleanups.push(effect(() => {
                    const attrValue = def.converter.toAttribute(sig(), def.type)
                    this.__fuReflecting = def.attribute
                    try {
                        if (attrValue === null) this.removeAttribute(def.attribute)
                        else this.setAttribute(def.attribute, attrValue)
                    } finally {
                        this.__fuReflecting = null
                    }
                }))
            }

            this.__fuApi = factory(propsView, { listeners, slots: this.__fuSlots || {} })
            this.__fuApi.render(root)

            if (shadowInit) applyShadowStyles(root, styleList)
            else applyDocumentStyles(tagName, styleList)
        }

        __fuUnmount() {
            const api = this.__fuApi
            this.__fuApi = null
            for (const cleanup of this.__fuCleanups.splice(0)) cleanup()
            if (api) api.unmount()
        }
    }

    for (const def of propDefs.values()) {
        Object.defineProperty(FuseeElement.prototype, def.name, {
            get() {
                return this.__fuSignals.get(def.name)()
            },
            set(value) {
                this.__fuSignals.get(def.name)(value)
            },
            enumerable: true,
            configurable: true
        })
    }

    FuseeElement.tagName = tagName
    customElements.define(tagName, FuseeElement)
    return FuseeElement
}

/** Registers an existing defineComponent() component as a custom element. */
export function toCustomElement(Component, tagName, overrides = {}) {
    const baseOptions = Component?._options
    if (!baseOptions) {
        throw new TypeError('[fusée] toCustomElement() expects a component created with defineComponent()')
    }
    return defineElement(tagName, { ...baseOptions, ...overrides })
}

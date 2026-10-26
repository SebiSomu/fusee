const HTML_NS = 'http://www.w3.org/1999/xhtml'

/** Reports whether an element is (or will upgrade to) an autonomous custom element. */
export function isCustomElement(el) {
    return el.namespaceURI === HTML_NS && el.localName.includes('-')
}

/** Converts a kebab-case attribute name to its camelCase property name. */
function camelize(name) {
    return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/** Finds a property on the element or its class whose name matches case-insensitively. */
function findPropertyIgnoringCase(el, name) {
    const target = name.toLowerCase()

    for (const key of Object.keys(el)) {
        if (key.toLowerCase() === target) return key
    }

    let proto = Object.getPrototypeOf(el)
    while (proto && proto !== HTMLElement.prototype) {
        for (const key of Object.getOwnPropertyNames(proto)) {
            if (key.toLowerCase() === target) return key
        }
        proto = Object.getPrototypeOf(proto)
    }

    return null
}

/**
 * Decides whether a binding on a custom element should be set as a property, so arrays
 * and objects reach the element intact instead of being stringified into an attribute.
 * Returns the property name to assign, or null to fall back to attribute handling.
 *
 * Template attribute names arrive lowercased by the HTML parser (`:userData` → `userdata`),
 * so names are matched case-insensitively against the upgraded element's properties.
 * For an element that is not defined yet, rich values are still set as a property under
 * the camelized name; the element picks them up when it upgrades.
 */
export function resolveElementProperty(el, name, value) {
    if (!isCustomElement(el)) return null

    const camel = camelize(name)
    if (camel in el) return camel
    if (name in el) return name

    const matched = findPropertyIgnoringCase(el, camel)
    if (matched) return matched

    if (value !== null && typeof value === 'object') return camel
    return null
}

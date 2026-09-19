// Point your bundler at this module and JSX compiles here with zero custom
// parser/Babel plugin needed yet:
//   - esbuild/Vite:  jsx: 'automatic', jsxImportSource: '<path-to-this-folder>'
//   - tsconfig.json: "jsx": "react-jsx", "jsxImportSource": "<path-to-this-folder>"

import { h, createComponent } from './h.js'
import {
    Fragment,
    For,
    Show,
    Slot,
    on,
    flattenChildren,
    normalizeEventProps,
    normalizeComponentListenerProps,
    splitSlotChildren
} from './jsx-helpers.js'
import { defineComponent as coreDefineComponent } from '../component.js' // adjust to your project layout

export { Fragment, For, Show, Slot, on }

/**
 * Wraps defineComponent so JSX can tell "a fusée component" apart from a
 * plain helper function (Fragment/For/Show/Slot, or your own stateless JSX
 * helpers). Import defineComponent from here instead of component.js in
 * any file that defines components with JSX.
 */
export function defineComponent(options) {
    const factory = coreDefineComponent(options)
    factory._isFuseeComponent = true
    factory._componentName = options?.name
    return factory
}

/** Dispatches a JSX element to h() (DOM tags), createComponent() (fusée components), or a direct call (helpers). */
function createNode(type, rawProps) {
    const { children, ...rest } = rawProps || {}

    if (type === Fragment) {
        return Fragment({ children })
    }

    if (typeof type === 'string') {
        return h(type, normalizeEventProps(rest), flattenChildren(children))
    }

    if (typeof type === 'function' && type._isFuseeComponent) {
        const name = type._componentName || type.name || 'AnonymousComponent'
        const props = normalizeComponentListenerProps(rest)
        return createComponent(name, type, props, splitSlotChildren(children))
    }

    if (typeof type === 'function') {
        return type({ ...rest, children })
    }

    console.warn('[fusée] Unsupported JSX element type:', type)
    return null
}

/** Automatic JSX runtime entry point for a single (or statically known) child. */
export function jsx(type, props, _key) {
    return createNode(type, props)
}

/** Automatic JSX runtime entry point when children are a static array. */
export function jsxs(type, props, _key) {
    return createNode(type, props)
}

/** Dev-mode entry point; fusée doesn't use the extra source/self-closing args (yet). */
export function jsxDEV(type, props, _key, _isStaticChildren, _source, _self) {
    return createNode(type, props)
}
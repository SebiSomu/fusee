import { getCurrentInstance } from './component.js'

/** Marks a function as a composable while preserving its name and call shape. */
export function defineComposable(fn) {
    const composable = function (...args) {
        return fn(...args)
    }

    composable._isComposable = true

    Object.defineProperty(composable, 'name', {
        value: fn.name || 'composable',
        configurable: true
    })

    return composable
}

/** Warns when a composable runs outside component setup and returns the instance. */
export function assertSetupContext(name) {
    const instance = getCurrentInstance()
    if (!instance) {
        console.warn(
            `[framework] ${name ? name + ' ' : ''}composable was called outside of setup(). ` +
            `Lifecycle hooks (onMount, onUnmount) and injections will not work.`
        )
    }
    return instance
}

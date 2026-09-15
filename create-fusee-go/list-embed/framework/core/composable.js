import { getCurrentInstance } from './component.js'

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

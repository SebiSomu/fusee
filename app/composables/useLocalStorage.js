import { defineComposable, signal, effect } from '../../framework/index.js'

/**
 * @template T
 * @param {string} key
 * @param {T}      defaultValue
 */
export const useLocalStorage = defineComposable((key, defaultValue = null) => {
    const stored = localStorage.getItem(key)
    let initial

    try {
        initial = stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
        initial = defaultValue
        localStorage.removeItem(key)
    }

    const value = signal(initial)

    effect(() => {
        const current = value()
        if (current === null || current === undefined) {
            localStorage.removeItem(key)
        } else {
            localStorage.setItem(key, JSON.stringify(current))
        }
    })

    return value
})

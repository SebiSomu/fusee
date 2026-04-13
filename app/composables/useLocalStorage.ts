import { defineComposable, signal, effect } from '../../framework/index.js'

export const useLocalStorage = defineComposable(<T>(key: string, defaultValue: T | null = null): Signal<T | null> => {
    const stored = localStorage.getItem(key)
    let initial: T | null

    try {
        initial = stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
        initial = defaultValue
        localStorage.removeItem(key)
    }

    const value = signal<T | null>(initial)

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

import { defineComposable, signal, effect } from '../../framework/index.js'

/**
 * @template T
 * @param {string | (() => string)} urlOrSignal
 * @param {{ immediate?: boolean, transform?: (raw: any) => T }} [options]
 */
export const useFetch = defineComposable((urlOrSignal, options = {}) => {
    const { immediate = true, transform = null } = options

    const data    = signal(null)
    const loading = signal(false)
    const error   = signal(null)

    let controller = null

    const execute = () => {
        const url = typeof urlOrSignal === 'function' ? urlOrSignal() : urlOrSignal
        if (!url) return

        if (controller) controller.abort()
        controller = new AbortController()

        loading(true)
        error(null)

        fetch(url, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
                return res.json()
            })
            .then(raw => {
                data(transform ? transform(raw) : raw)
                loading(false)
            })
            .catch(err => {
                if (err.name === 'AbortError') return
                error(err.message ?? String(err))
                loading(false)
            })
    }

    if (typeof urlOrSignal === 'function') {
        effect(() => {
            urlOrSignal()
            execute()
        })
    } else if (immediate) {
        execute()
    }

    return { data, loading, error, refetch: execute }
})

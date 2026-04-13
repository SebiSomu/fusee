import { defineComposable, signal, effect } from '../../framework/index.js'

export interface FetchOptions<T> {
    immediate?: boolean
    transform?: (raw: any) => T
}

export interface FetchResult<T> {
    data:    Signal<T | null>
    loading: Signal<boolean>
    error:   Signal<string | null>
    refetch: () => void
}

export const useFetch = defineComposable(<T = any>(
    urlOrSignal: string | (() => string), 
    options: FetchOptions<T> = {}
): FetchResult<T> => {
    const { immediate = true, transform = null } = options

    const data    = signal<T | null>(null)
    const loading = signal(false)
    const error   = signal<string | null>(null)

    let controller: AbortController | null = null

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

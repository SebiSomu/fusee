export function compileRoute(pattern) {
    const segments = pattern.split('/').filter(Boolean)
    const params = []
    let regexBody = ''

    for (const seg of segments) {
        const catchAll = /^\[\.\.\.(.+)\]$/.exec(seg)
        const dynamic = /^\[(.+)\]$/.exec(seg)

        if (catchAll) {
            params.push({ name: catchAll[1], catchAll: true })
            regexBody += '/(.+)'
        } else if (dynamic) {
            params.push({ name: dynamic[1], catchAll: false })
            regexBody += '/([^/]+)'
        } else {
            regexBody += '/' + escapeRegex(seg)
        }
    }

    if (regexBody === '') regexBody = '/'
    return { regex: new RegExp(`^${regexBody}/?$`), params }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function matchRoute(routes, pathname) {
    const normalized = pathname === '' ? '/' : pathname

    for (const route of routes) {
        if (!route._compiled) route._compiled = compileRoute(route.pattern)
        const { regex, params: paramSpecs } = route._compiled

        const m = regex.exec(normalized)
        if (!m) continue

        const params = {}
        paramSpecs.forEach((spec, i) => {
            const raw = m[i + 1]
            params[spec.name] = spec.catchAll ? raw : decodeURIComponent(raw)
        })

        return { route, params }
    }

    return null
}
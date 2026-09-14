export class RouteRedirect extends Error {
    constructor(status, location) {
        super(`redirect(${status}) to ${location}`)
        this.name = 'RouteRedirect'
        this.status = status
        this.location = location
    }
}

export class RouteHttpError extends Error {
    constructor(status, message) {
        super(message)
        this.name = 'RouteHttpError'
        this.status = status
    }
}

export function redirect(status, location) {
    throw new RouteRedirect(status, location)
}

export function httpError(status, message) {
    throw new RouteHttpError(status, message)
}
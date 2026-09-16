export class RouteRedirect extends Error {
    /** Creates a control-flow error representing an HTTP redirect response. */
    constructor(status, location) {
        super(`redirect(${status}) to ${location}`)
        this.name = 'RouteRedirect'
        this.status = status
        this.location = location
    }
}

export class RouteHttpError extends Error {
    /** Creates a control-flow error representing an intentional HTTP failure. */
    constructor(status, message) {
        super(message)
        this.name = 'RouteHttpError'
        this.status = status
    }
}

/** Aborts route loading and asks the dispatcher to send a redirect. */
export function redirect(status, location) {
    throw new RouteRedirect(status, location)
}

/** Aborts route loading and asks the dispatcher to send an HTTP error. */
export function httpError(status, message) {
    throw new RouteHttpError(status, message)
}
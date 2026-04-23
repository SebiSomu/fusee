import type { ComponentApi } from './component'
import type { Signal } from './signal'

export type Route = {
    path: string
    component: () => ComponentApi
}

export type Router = {
    navigate: (path: string) => void
    destroy: () => void
}

export type RouteParams = Record<string, string>

export declare const currentRoute: Signal<string>
export declare const routeParams: Signal<RouteParams>
export declare function createRouter(routes: Route[]): Router
export declare function navigate(path: string): void
export declare function mountOutlet(el: HTMLElement): void

export type FileRouterOptions = {
    loadingComponent?: any
}

export declare function generateRoutesFromFiles(
    globResults: Record<string, () => Promise<any>>,
    options?: FileRouterOptions
): Route[]

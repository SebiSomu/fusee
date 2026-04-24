import type { ComponentApi, ComponentFactory } from './component'
import type { Signal } from './signal'

export type Route = {
    path: string
    component: ComponentFactory<any>
    children?: Route[]
}

export type Router = {
    navigate: (path: string) => void
    destroy: () => void
}

export type RouteParams = Record<string, string>

export declare const currentRoute: Signal<string>
export declare const routeParams: Signal<RouteParams>
export declare const matchedRoutes: Signal<Route[]>

export declare function createRouter(routes: Route[]): Router
export declare function navigate(path: string): void
export declare function mountOutlet(el: HTMLElement): void

export type FileRouterOptions = {
    loadingComponent?: ComponentFactory<any>
}

export declare function generateRoutes(
    globResults: Record<string, () => Promise<any>>,
    options?: FileRouterOptions
): Route[]

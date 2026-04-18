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

export declare const currentRoute: Signal<string>
export declare function createRouter(routes: Route[]): Router
export declare function navigate(path: string): void
export declare function mountOutlet(el: HTMLElement): void

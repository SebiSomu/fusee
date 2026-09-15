import type { ComponentApi, ComponentFactory } from './component'
import type { Signal } from './signal'

export type Route = {
    path: string | string[]
    name?: string
    meta?: Record<string, any>
    redirect?: string
    component?: ComponentFactory<any>
    children?: Route[]
}

export type RouteLocation = {
    path: string
    fullPath: string
    params: RouteParams
    query: Record<string, string>
    meta: Record<string, any>
    name?: string
}

export type NavigationGuard = (
    to: RouteLocation,
    from: RouteLocation
) => boolean | string | void | Promise<boolean | string | void>

export type NavigationHook = (to: RouteLocation, from: RouteLocation) => void
export type Middleware = NavigationGuard
export type ErrorHandler = (error: any) => void

export type ScrollPosition = { left: number; top: number } | { selector: string } | false

export type ScrollBehaviorOptions = {
    scrollToTop?: boolean
    scrollToAnchor?: boolean
    saveScrollPosition?: boolean
    custom?: (to: string, from: string, savedPosition: ScrollPosition | null) => ScrollPosition | Promise<ScrollPosition>
}

export type NavigateOptions = {
    replace?: boolean
    state?: any
    force?: boolean
}

export type Router = {
    navigate: (path: string, options?: NavigateOptions) => Promise<void>
    destroy: () => void
}

export type RouteParams = Record<string, string>

export declare const currentRoute: Signal<string>
export declare const routeParams: Signal<RouteParams>
export declare const routeQuery: Signal<Record<string, string>>
export declare const matchedRoutes: Signal<Route[]>
export declare const routeMeta: Signal<Record<string, any>>

export declare function beforeEach(guard: NavigationGuard): () => void
export declare function afterEach(hook: NavigationHook): () => void
export declare function use(middleware: Middleware): () => void
export declare function onError(handler: ErrorHandler): () => void

export declare function createRouter(routes: Route[], options?: { cacheSize?: number; routerViewTimeout?: number; scrollBehavior?: ScrollBehaviorOptions }): Router
export declare function navigate(path: string, options?: NavigateOptions): Promise<void>
export declare function mountOutlet(el: HTMLElement): void

export type FileRouterOptions = {
    loadingComponent?: ComponentFactory<any>
}

export declare function generateRoutes(globResults: Record<string, () => Promise<any>>, options?: FileRouterOptions): Route[]

// ─── Router Types ─────────────────────────────────────────────────────────────

import type { ComponentApi } from './component'

export type Route = {
  path: string
  component: () => ComponentApi
}

export type Router = {
  navigate: (path: string) => void
}

export declare function createRouter(routes: Route[]): Router
export declare function navigate(path: string): void
export declare function mountOutlet(el: HTMLElement): void

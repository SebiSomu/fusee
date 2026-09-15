export interface HydrationCacheEntry {
    data: unknown
    updatedAt: number
}

export type HydrationSnapshot = Record<string, Record<string, HydrationCacheEntry>>

export interface FuseeWindowState {
    resources?: HydrationSnapshot
    signals?: Record<string, any[]>
}

export declare function _registerResourceCache(resourceKey: string,cache: Map<string, HydrationCacheEntry>): void
export declare function extractHydrationData(ctxOrNothing?: any): HydrationSnapshot
export declare function dehydrate(snapshot?: HydrationSnapshot): string
export declare function renderDehydrationScript(ctxOrNothing?: any): string
export declare function readWindowState(): FuseeWindowState | null
export declare function loadHydration(snapshot: HydrationSnapshot): void
export declare function hydrateFromWindow(): void
export declare function getHydratedEntries(resourceKey: string): Map<string, HydrationCacheEntry> | null
export declare function isHydrationFresh(resourceKey: string, cacheKey: string,staleTime?: number): boolean
export declare function clearHydration(): void
export declare function getHydrationSnapshot(): HydrationSnapshot

export interface HydrateBindingSpec {
    type: 'bind' | 'attrs' | 'if'
    get?: () => any
    branches?: Array<{ cond: () => boolean; render: () => string }>
}

export declare function hydrateAnchors(root: Element | DocumentFragment | Document,bindings?: HydrateBindingSpec[]): () => void

declare global {
    interface Window {
        __FUSEE_HYDRATION__?: HydrationSnapshot
        __FUSEE_STATE__?: FuseeWindowState
    }
}

export interface HydrationCacheEntry {
    data: unknown
    updatedAt: number
}

export type HydrationSnapshot = Record<string, Record<string, HydrationCacheEntry>>
export declare function _registerResourceCache(
    resourceKey: string,
    cache: Map<string, HydrationCacheEntry>
): void

export declare function extractHydrationData(): HydrationSnapshot
export declare function dehydrate(snapshot?: HydrationSnapshot): string
export declare function loadHydration(snapshot: HydrationSnapshot): void
export declare function hydrateFromWindow(): void
export declare function getHydratedEntries(resourceKey: string): Map<string, HydrationCacheEntry> | null
export declare function isHydrationFresh(
    resourceKey: string,
    cacheKey: string,
    staleTime?: number
): boolean

export declare function clearHydration(): void
export declare function getHydrationSnapshot(): HydrationSnapshot

declare global {
    interface Window {
        __FUSEE_HYDRATION__?: HydrationSnapshot
    }
}
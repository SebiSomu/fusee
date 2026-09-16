export interface FuseeHydrationOptions {
    components?: Record<string, any>
    context?: Record<string, any>
    autoExtractState?: boolean
}

export declare function extractAndApplyEmbeddedState(root: Element): void
export declare function hydrateFragment(node: Element, context?: Record<string, any>, components?: Record<string, any>, opts?: { autoExtractState?: boolean }): Array<() => void>
export declare function cleanupFragment(target: Element): void
export declare function enableFuseeHydration(options?: FuseeHydrationOptions): () => void
export interface ActionOptions {
    name?: string
    baseUrl?: string
    headers?: Record<string, string>
}

export interface UseActionOptions {
    onSuccess?: (data: any) => void
    onError?: (error: Error) => void
    resetOnCall?: boolean
}

export interface ActionReturn {
    execute: (...args: any[]) => Promise<any>
    pending: Signal<boolean>
    data: Signal<any>
    error: Signal<any>
    reset: () => void
}

export interface ActionProxy extends Function {
    _isAction: boolean
    _actionName: string
}

export declare function defineAction(fnOrName: Function | string, opts?: ActionOptions): ActionProxy
export declare function createActionProxy(name: string, opts?: ActionOptions): ActionProxy
export declare function useAction(action: ActionProxy, opts?: UseActionOptions): ActionReturn

// ─── Hydration Support ─────────────────────────────────────────────────────

export interface ActionHydrationOptions {
    staleTime?: number
}

export interface ActionHydrationEntry {
    data: any
    timestamp: number
    staleTime: number
}

export interface ActionHydrationSnapshot {
    [key: string]: ActionHydrationEntry
}

export declare function hydrateAction(actionName: string, data: any, opts?: ActionHydrationOptions): void
export declare function getHydratedAction(actionName: string, staleTime?: number): any
export declare function clearActionHydration(): void
export declare function extractActionHydration(): ActionHydrationSnapshot
export declare function loadActionHydration(snapshot: ActionHydrationSnapshot): void

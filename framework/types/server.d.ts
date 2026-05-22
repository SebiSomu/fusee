export interface RequestContext {
    inFlightMaps: {
        byKey: Map<string, Promise<any>>
        byFetcher: WeakMap<Function, Map<string, Promise<any>>>
    }
}

export declare function createRequestContext(): RequestContext
export declare function withRequestContext<T>(ctx: RequestContext, fn: () => T): T
export declare function getInFlightStore(): RequestContext['inFlightMaps']
export declare function isSSRContext(): boolean
export interface StreamBoundaryEntry {
    id: string
    status: 'pending' | 'resolved' | 'rejected'
    promise?: Promise<any>
    html?: string
    error?: any
}

export interface RequestContext {
    inFlightMaps: {
        byKey: Map<string, Promise<any>>
        byFetcher: WeakMap<Function, Map<string, Promise<any>>>
    }
    resourceRegistry: {
        caches: Array<{ resourceKey: string; cache: Map<string, any> }>
    }
    streamBoundaries: {
        list: StreamBoundaryEntry[]
        nextId: number
    }
    signalScope: {
        stack: Array<{ scopeId: string; index: number }>
        registry: Map<string, any[]>
    }
}

export declare function createRequestContext(): RequestContext
export declare function withRequestContext<T>(ctx: RequestContext, fn: () => T): T
export declare function getInFlightStore(): RequestContext['inFlightMaps']
export declare function isSSRContext(): boolean
export declare function getStreamBoundaryStore(): RequestContext['streamBoundaries']

export interface SuspenseBoundaryOptions<T = any> {
    fetcher: () => Promise<T> | T
    render: (data: T) => string
    fallback?: () => string
    onError?: (err: any) => string
    id?: string
}

export declare function renderSuspenseBoundary<T = any>(opts: SuspenseBoundaryOptions<T>): string
export declare function createSSRStreamResponse(renderShell: () => string | Promise<string> | AsyncIterable<string>, opts?: Record<string, any>): ReadableStream<Uint8Array>
export declare function streamToString(stream: ReadableStream<Uint8Array>): Promise<string>
export declare function pipeToNodeResponse(webStream: ReadableStream<Uint8Array>, res: any, opts?: { status?: number; headers?: Record<string, string> }): Promise<void>
export declare function renderPageSSR<T = any>(runPass: () => Promise<T> | T, opts?: { maxPasses?: number }): Promise<T>

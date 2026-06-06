export interface ActionServerOptions {
    name?: string
    authorize?: (...args: any[]) => Promise<void> | void
}

export interface RegisteredAction {
    fn: Function
    opts: ActionServerOptions
}

export interface ActionRegistry {
    get(name: string): RegisteredAction | undefined
    set(name: string, entry: RegisteredAction): void
    keys(): IterableIterator<string>
}

export interface RequestLike {
    params?: { name?: string }
    body?: any
    url?: string
}

export interface ResponseLike {
    status(code: number): ResponseLike
    json(body: any): any
}

export interface ActionError extends Error {
    status?: number
    code?: string
    expose?: boolean
}

export declare function defineAction(fn: Function, opts?: ActionServerOptions): Function
export declare function handleActionRequest(req: RequestLike, res: ResponseLike): Promise<void>
export declare function getRegisteredActions(): string[]

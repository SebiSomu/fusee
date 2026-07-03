export interface ActionsPluginOptions {
    serverActionsFile?: string
    clientActionsFile?: string
    baseUrl?: string
    typesOutput?: string
}

export interface ActionDef {
    name: string
    exportName: string
}

export interface ActionValidationResult {
    warnings: string[]
    errors: string[]
}

export declare function actionsPlugin(options?: ActionsPluginOptions): {
    name: 'vite-plugin-fusee-actions'
    configResolved(config: { root: string }): void
    resolveId(id: string): string | undefined
    load(id: string): Promise<string | null>
    buildEnd(): Promise<void>
    handleHotUpdate(ctx: { file: string; server: unknown }): void
}

export declare function validateActions(serverActions: ActionDef[], clientActions: string[]): ActionValidationResult
export declare function generateClientStubs(actions: ActionDef[], options?: { baseUrl?: string }): string
export declare function generateServerRoutes(actions: ActionDef[], options?: { serverActionsFile?: string; baseUrl?: string }): string
export declare function generateActionTypes(actions: ActionDef[]): string
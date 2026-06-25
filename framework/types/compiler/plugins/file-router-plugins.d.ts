export interface FileRouterPluginOptions {
    pagesDir?: string
    loadingComponent?: unknown
}

export interface RouteNode {
    path: string
    filePath?: string
    children?: RouteNode[]
}

export interface RouteValidationResult {
    warnings: string[]
    errors: string[]
}

export interface ImportEntry {
    varName: string
    filePath: string
}

export declare function fileRouterPlugin(options?: FileRouterPluginOptions): {
    name: 'vite-plugin-fusee-file-router'
    buildStart(): Promise<void>
    resolveId(id: string): string | undefined
    load(id: string): Promise<string | null>
}

export declare function compileFileRoutes(files: string[], options?: { pagesDir?: string }): RouteNode[]
export declare function generateRoutesModule(routes: RouteNode[], pagesDir?: string): string
export declare function validateRoutes(routes: RouteNode[]): RouteValidationResult
export declare function generateRouteTypes(routes: RouteNode[]): string
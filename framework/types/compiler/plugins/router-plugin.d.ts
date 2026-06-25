export interface RouterPluginOptions {
    typesOutput?: string
    pagesDir?: string
    strict?: boolean
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

export declare function routerPlugin(options?: RouterPluginOptions): {
    name: 'vite-plugin-fusee-router'
    generateBundle(): Promise<void>
}

export declare function validateRoutes(routes: RouteNode[]): RouteValidationResult
export declare function generateRouterTypes(routes: RouteNode[]): string
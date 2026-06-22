import type { RootNode } from './ast.js'

export interface GenerateOptions {
    runtimePath?: string
    source?: string
}

export declare function generate(ast: RootNode, options?: GenerateOptions): string
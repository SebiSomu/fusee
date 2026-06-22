import type { RootNode }       from './ast.js'
import type { Token }          from './lexer.js'
import type { CompileWarning } from './errors.js'
import type { CompileError }   from './errors.js'

export interface CompileOptions {
    components?: string[] | Set<string>
    runtimePath?: string
    filename?: string
    throwOnWarning?: boolean
    scope?: string[]
}

export interface CompileResult {
    code: string
    ast: RootNode
    tokens: Token[]
    warnings: CompileWarning[]
}

export interface ParseOnlyResult {
    ast: RootNode
    tokens: Token[]
}

export interface BatchEntry {
    id: string
    source: string
}

export interface BatchResult {
    id: string
    code: string | null
    warnings: CompileWarning[]
    error: CompileError | null
}

export declare function compile(source: string, options?: CompileOptions): CompileResult
export declare function parseOnly(source: string, options?: Pick<CompileOptions, 'components'>): ParseOnlyResult
export declare function transformOnly(ast: RootNode, options?: Pick<CompileOptions, 'components' | 'scope'> & { source?: string }): { ast: RootNode; warnings: CompileWarning[] }
export declare function compileBatch(templates: BatchEntry[], sharedOptions?: CompileOptions): BatchResult[]

export interface FuseePluginOptions {
    runtimePath?: string
    components?: string[]
    scope?: string[]
}
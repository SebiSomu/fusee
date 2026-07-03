import type { SourceLocation } from './ast.js'
import type { ErrorCode } from './errors-list.js'

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode]

export declare class CompileError extends Error {
    readonly name: 'CompileError'
    readonly code: ErrorCodeValue
    readonly loc: SourceLocation | null
    readonly source: string

    constructor(code: ErrorCodeValue, loc: SourceLocation | null, source: string, ...args: string[])

    format(filePath?: string): string
    _buildSnippet(): string
}

export declare class CompileWarning {
    readonly message: string
    readonly code: ErrorCodeValue
    readonly loc: SourceLocation | null
    readonly source: string

    constructor(code: ErrorCodeValue, loc: SourceLocation | null, source: string, ...args: string[])

    format(filePath?: string): string
}

export declare class ErrorCollector {
    readonly source: string
    readonly errors: CompileError[]
    readonly warnings: CompileWarning[]
    readonly hasErrors: boolean
    readonly hasWarnings: boolean

    constructor(source: string)

    error(code: ErrorCodeValue, loc: SourceLocation | null, ...args: string[]): CompileError
    warn(code: ErrorCodeValue, loc: SourceLocation | null, ...args: string[]): CompileWarning
    throwIfAny(): void
}

export declare function throwError(code: ErrorCodeValue, loc: SourceLocation | null, source: string, ...args: string[]): never
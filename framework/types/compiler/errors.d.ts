import type { SourceLocation } from './ast.js'

export declare const ErrorCode: {
    readonly UNEXPECTED_CHAR: 'E001'
    readonly UNTERMINATED_STRING: 'E002'
    readonly UNTERMINATED_MUSTACHE: 'E003'
    readonly UNTERMINATED_TAG: 'E004'
    readonly MALFORMED_COMMENT: 'E005'
    readonly UNEXPECTED_TOKEN: 'P001'
    readonly MISSING_CLOSING_TAG: 'P002'
    readonly UNEXPECTED_CLOSING_TAG: 'P003'
    readonly INVALID_DIRECTIVE_SYNTAX: 'P004'
    readonly INVALID_FOR_SYNTAX: 'P005'
    readonly DUPLICATE_KEY: 'P006'
    readonly V_ELSE_NO_IF: 'P007'
    readonly EMPTY_EXPRESSION: 'P008'
    readonly INVALID_SLOT_NAME: 'P009'
    readonly DUPLICATE_DIRECTIVE: 'T001'
    readonly FOR_MISSING_KEY: 'T002'
    readonly MODEL_ON_NON_INPUT: 'T003'
    readonly COMPONENT_NOT_REGISTERED: 'T004'
    readonly UNKNOWN_IDENTIFIER: 'S001'
    readonly STATIC_FOR_KEY: 'S002'
    readonly UNKNOWN_NODE_TYPE: 'G001'
}

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
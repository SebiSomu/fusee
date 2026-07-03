import type { SourceLocation } from './ast.js'

export declare const TokenType: {
    readonly TAG_OPEN: 'TAG_OPEN'
    readonly TAG_OPEN_CLOSE: 'TAG_OPEN_CLOSE'
    readonly TAG_CLOSE: 'TAG_CLOSE'
    readonly TAG_SELF_CLOSE: 'TAG_SELF_CLOSE'
    readonly COMMENT: 'COMMENT'
    readonly ATTR_NAME: 'ATTR_NAME'
    readonly ATTR_EQUALS: 'ATTR_EQUALS'
    readonly ATTR_VALUE: 'ATTR_VALUE'
    readonly TEXT: 'TEXT'
    readonly MUSTACHE_OPEN: 'MUSTACHE_OPEN'
    readonly MUSTACHE_EXPR: 'MUSTACHE_EXPR'
    readonly MUSTACHE_CLOSE: 'MUSTACHE_CLOSE'
    readonly EOF: 'EOF'
}

export type TokenTypeValue = typeof TokenType[keyof typeof TokenType]

export interface Token {
    type: TokenTypeValue
    value: string
    loc: SourceLocation
}

export declare function tokenize(source: string): Token[]
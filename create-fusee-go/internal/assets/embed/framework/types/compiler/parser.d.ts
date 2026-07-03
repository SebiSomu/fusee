import type { Token } from './lexer.js'
import type { RootNode } from './ast.js'

export declare function parse(tokens: Token[], source: string, components?: Set<string>): RootNode
import type { RootNode }       from './ast.js'
import type { CompileWarning } from './errors.js'

export interface TransformOptions {
    components?: Set<string>
    source?: string
    scope?: string[]
}

export interface TransformResult {
    ast: RootNode
    warnings: CompileWarning[]
}

/**
 * Run all transformer steps on the Root AST (mutates in-place).
 *
 * Steps:
 *  1. markStatic — bottom-up static marking
 *  2. hoistStatic — collect f-once + multi-static-child subtrees
 *  3. chainConditionals — f-if / f-else-if / f-else -> IfNode
 *  4. validateFor — warn on f-for without :key  (T002)
 *  5. validateModel — warn on f-model on non-input  (T003)
 *  6. validateComponents — warn on unregistered component  (T004)
 *  7. analyseScope — resolve identifiers (needs `scope`)
 *  8. validateExpressions — warn on unknown identifiers (S001) + static :key (S002)
 */
export declare function transform(ast: RootNode, options?: TransformOptions): TransformResult
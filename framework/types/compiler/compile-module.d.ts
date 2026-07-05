import type { SourceMapGenerator } from 'magic-string'

export interface RuneEntry {
  kind: string
  callNode: any
  declaratorNode?: any
  bare?: boolean
}

export interface CompileModuleOptions {
  filename?: string
}

export interface CompileModuleResult {
  code: string
  map: ReturnType<SourceMapGenerator['toJSON']> | null
  runes: Map<string, RuneEntry>
  warnings: string[]
  runtimeImports: string[]
}

export declare function compileModule(source: string, options?: CompileModuleOptions): CompileModuleResult

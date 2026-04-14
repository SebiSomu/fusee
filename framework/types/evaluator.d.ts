import type { ComponentResult } from './component'

export type InterpolationPart = {
    type: 'static' | 'dynamic'
    value?: string
    key?: string
}

export const MUSTACHE_RE: RegExp

export function evaluateExpression(expr: string, context: Record<string, any>, extraContext?: Record<string, any>): any
export function parseInterpolation(str: string): InterpolationPart[]
export function sanitizeAttr(name: string, value: string): string

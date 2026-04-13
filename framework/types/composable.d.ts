export interface Composable<T = any> {
    (...args: any[]): T
    readonly _isComposable: true
}

declare global {
    interface Composable<T = any> {
        (...args: any[]): T
        readonly _isComposable: true
    }
}

export function defineComposable<T>(fn: (...args: any[]) => T): Composable<T>
export function assertSetupContext(name?: string): any
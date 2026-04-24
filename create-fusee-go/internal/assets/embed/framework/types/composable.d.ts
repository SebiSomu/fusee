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

export declare function defineComposable<T extends (...args: any[]) => any>(fn: T): T;
export declare function assertSetupContext(name?: string): void;
export declare class InjectionToken<T = any> {
    constructor(description: string);
    description: string;
    toString(): string;
}

export declare function provideGlobal<T>(token: any, provider: T | (new () => T) | (() => T)): void;

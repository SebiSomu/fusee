export declare class InjectionToken<T = any> {
    constructor(description: string);
    description: string;
    toString(): string;
}

export declare function isClass(fn: any): boolean;

export interface InjectOptions {
    optional?: boolean;
    skipSelf?: boolean;
    self?: boolean;
}

export declare abstract class Injector {
    get<T>(token: any, options?: InjectOptions): T;
}

export declare class NullInjector extends Injector {
    get<T>(token: any, options?: InjectOptions): T | null;
}

export declare type Provider = 
  | any // class (shorthand)
  | { provide: any, useClass: any }
  | { provide: any, useValue: any }
  | { provide: any, useFactory: () => any }
  | { provide: any, useExisting: any };

export declare class EnvironmentInjector extends Injector {
    constructor(providers?: Provider[], parent?: Injector);
    parent: Injector;
    records: Map<any, any>;
    instances: Map<any, any>;
    resolutionStack: Set<any>;
    
    provide(provider: Provider): void;
    get<T>(token: any, options?: InjectOptions): T;
    createChild(providers?: Provider[]): EnvironmentInjector;
    destroy(): void;
}

export declare function runInContext<T>(injector: Injector, fn: () => T): T;
export declare function replaceActiveInjector(injector: Injector | null): void;
export declare function inject<T>(token: any, defaultValueOrOptions?: T | InjectOptions | (() => T), treatDefaultAsFactory?: boolean): T;
export declare const rootInjector: EnvironmentInjector;
export declare function provideGlobal(provider: Provider): void;
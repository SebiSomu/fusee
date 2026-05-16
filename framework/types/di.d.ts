export declare class InjectionToken<T = any> {
    constructor(description: string);
    description: string;
    toString(): string;
}

export declare function isClass(fn: any): boolean;

export interface InjectOptions {
    optional?: boolean;
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
    get<T>(token: any, options?: InjectOptions): T | null;
}

export declare function runInContext<T>(injector: Injector, fn: () => T): T;
export declare function inject<T>(token: any, options?: InjectOptions): T;

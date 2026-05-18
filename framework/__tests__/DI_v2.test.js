import { describe, it, expect } from 'vitest'
import { 
    InjectionToken, 
    EnvironmentInjector, 
    NullInjector, 
    inject, 
    runInContext 
} from '../core/di.js'

describe('Fusée DI v2: Hierarchical System', () => {

    it('should throw NullInjectorError if token not provided', () => {
        const root = new NullInjector();
        expect(() => root.get('Missing')).toThrow(/NullInjectorError/);
    });

    it('should return null if optional: true', () => {
        const root = new NullInjector();
        expect(root.get('Missing', { optional: true })).toBeNull();
    });

    it('should resolve useValue provider', () => {
        const TOKEN = new InjectionToken('API_URL');
        const injector = new EnvironmentInjector([
            { provide: TOKEN, useValue: 'https://api.test' }
        ]);

        expect(injector.get(TOKEN)).toBe('https://api.test');
    });

    it('should resolve useClass and inject its dependencies', () => {
        const URL_TOKEN = new InjectionToken('URL');
        
        class HttpService {
            constructor() {
                this.url = inject(URL_TOKEN);
            }
        }

        const injector = new EnvironmentInjector([
            { provide: URL_TOKEN, useValue: 'https://api.test' },
            { provide: HttpService, useClass: HttpService }
        ]);

        const http = injector.get(HttpService);
        expect(http).toBeInstanceOf(HttpService);
        expect(http.url).toBe('https://api.test');
        
        // Singleton check
        expect(injector.get(HttpService)).toBe(http);
    });

    it('should resolve shorthand class provider', () => {
        class Logger {
            log() {}
        }
        const injector = new EnvironmentInjector([Logger]);
        const logger = injector.get(Logger);
        expect(logger).toBeInstanceOf(Logger);
    });

    it('should resolve useFactory and use inject() inside it', () => {
        const CONFIG = new InjectionToken('Config');
        const injector = new EnvironmentInjector([
            { provide: CONFIG, useValue: { prod: true } },
            { 
                provide: 'IsProd', 
                useFactory: () => {
                    const config = inject(CONFIG);
                    return config.prod;
                }
            }
        ]);

        expect(injector.get('IsProd')).toBe(true);
    });

    it('should resolve useExisting', () => {
        const OldToken = new InjectionToken('Old');
        const NewToken = new InjectionToken('New');

        const injector = new EnvironmentInjector([
            { provide: OldToken, useValue: 'Value' },
            { provide: NewToken, useExisting: OldToken }
        ]);

        expect(injector.get(NewToken)).toBe('Value');
    });

    it('should bubble up to parent injector', () => {
        const PARENT_TOKEN = new InjectionToken('Parent');
        const parent = new EnvironmentInjector([
            { provide: PARENT_TOKEN, useValue: 'parent-value' }
        ]);

        const child = new EnvironmentInjector([], parent);

        expect(child.get(PARENT_TOKEN)).toBe('parent-value');
    });

    it('should create a child injector linked to the parent via createChild', () => {
        const TOKEN = new InjectionToken('Scoped');
        const parent = new EnvironmentInjector([
            { provide: TOKEN, useValue: 'parent-scoped' }
        ]);

        const child = parent.createChild([
            { provide: TOKEN, useValue: 'child-scoped' }
        ]);

        expect(child.parent).toBe(parent);
        expect(child.get(TOKEN)).toBe('child-scoped');
        expect(parent.get(TOKEN)).toBe('parent-scoped');
    });

    it('should detect circular dependencies and output the path', () => {
        class A {
            constructor() {
                this.b = inject(B);
            }
        }
        
        class B {
            constructor() {
                this.a = inject(A);
            }
        }

        const injector = new EnvironmentInjector([A, B]);

        expect(() => injector.get(A)).toThrow(/Circular dependency detected: A -> B -> A/);
    });

    it('should allow inject() only within context', () => {
        expect(() => inject('Token')).toThrow(/called outside of an injection context/);
    });

    it('should support inject({ optional: true })', () => {
        const injector = new EnvironmentInjector([]);
        runInContext(injector, () => {
            const result = inject('MissingToken', { optional: true });
            expect(result).toBeNull();
        });
    });

    it('should support inject({ skipSelf: true })', () => {
        const TOKEN = new InjectionToken('SkipSelfToken');
        
        const parent = new EnvironmentInjector([
            { provide: TOKEN, useValue: 'parent-value' }
        ]);

        const child = new EnvironmentInjector([
            { provide: TOKEN, useValue: 'child-value' }
        ], parent);

        runInContext(child, () => {
            const defaultResult = inject(TOKEN);
            expect(defaultResult).toBe('child-value');

            const skipSelfResult = inject(TOKEN, { skipSelf: true });
            expect(skipSelfResult).toBe('parent-value');
        });
    });

    it('should not swallow real errors when optional: true', () => {
        const TOKEN = new InjectionToken('ErrorToken');
        const injector = new EnvironmentInjector([
            { provide: TOKEN, useFactory: () => { throw new Error('Real error'); } }
        ]);

        runInContext(injector, () => {
            expect(() => inject(TOKEN, { optional: true })).toThrow(/Real error/);
        });
    });
});

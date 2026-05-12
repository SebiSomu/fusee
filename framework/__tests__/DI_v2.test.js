import { describe, it, expect, vi } from 'vitest'
import { defineComponent, inject, provideGlobal, InjectionToken } from '../index.js'

describe('Fusée DI v2: Singletons & Tokens', () => {

    it('should support InjectionToken as a key', () => {
        const THEME_TOKEN = new InjectionToken('theme');
        const container = document.createElement('div');
        
        const Child = defineComponent({
            setup() {
                const theme = inject(THEME_TOKEN);
                return { theme, template: '<div></div>' };
            }
        });

        provideGlobal(THEME_TOKEN, 'dark');
        
        const childApi = Child();
        expect(childApi.instance.state.theme).toBe('dark');
    });

    it('should provide global singletons (lazy instantiation of classes)', () => {
        class Logger {
            constructor() {
                this.id = Math.random();
            }
            log(msg) { return msg; }
        }

        const CompA = defineComponent({
            setup() {
                const logger = inject(Logger);
                return { logger, template: '<div></div>' };
            }
        });

        const CompB = defineComponent({
            setup() {
                const logger = inject(Logger);
                return { logger, template: '<div></div>' };
            }
        });

        const apiA = CompA();
        const apiB = CompB();

        expect(apiA.instance.state.logger).toBeInstanceOf(Logger);
        expect(apiA.instance.state.logger.id).toBe(apiB.instance.state.logger.id);
    });

    it('should support factory providers globally', () => {
        const API_KEY = new InjectionToken('api-key');
        let callCount = 0;
        
        provideGlobal(API_KEY, () => {
            callCount++;
            return 'SECRET_123';
        });

        const Comp = defineComponent({
            setup() {
                const key = inject(API_KEY);
                return { key, template: '<div></div>' };
            }
        });

        const api1 = Comp();
        const api2 = Comp();

        expect(api1.instance.state.key).toBe('SECRET_123');
        expect(callCount).toBe(1); // Singleton: factory only called once
    });

    it('should prioritize component-level provide over global registry', () => {
        const TOKEN = new InjectionToken('test');
        provideGlobal(TOKEN, 'global-value');

        const Child = defineComponent({
            setup() {
                const val = inject(TOKEN);
                return { val, template: '<div></div>' };
            }
        });

        const Parent = defineComponent({
            setup() {
                const { provide } = Fusee; 
            }
        });
        
        const parentInstance = { _provides: { [TOKEN]: 'local-value' }, _parent: null };
        const childApi = Child({}, { parent: parentInstance });

        expect(childApi.instance.state.val).toBe('local-value');
    });
});

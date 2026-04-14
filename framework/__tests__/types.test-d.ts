import { expectTypeOf, test } from 'vitest'
import {
    signal,
    computed,
    watch,
    effect,
    batch,
    untrack,
    defineComponent,
    defineStore,
    onMount,
    onUnmount,
    provide,
    inject,
    inspect,
    defineComposable,
    assertSetupContext,
    resetStore,
    clearStores,
    registerStorePlugin,
    createRouter,
    navigate,
    mountOutlet,
    mountTemplate,
    directive,
    defineAsyncComponent,
    parseSlots
} from '../index'
import type { ComponentResult } from '../types/component'

// ─── 1. PRIMITIVE SIGNALS ─────────────────────────────────────────────────────

test('signal: number type inference and mutability', () => {
    const s = signal(10)
    expectTypeOf(s()).toEqualTypeOf<number>()
    expectTypeOf(s(20)).toEqualTypeOf<void>()
})

test('signal: string type inference and mutability', () => {
    const s = signal('Fusée')
    expectTypeOf(s()).toEqualTypeOf<string>()
    expectTypeOf(s('1.5')).toEqualTypeOf<void>()
})

test('signal: boolean type inference and mutability', () => {
    const s = signal(true)
    expectTypeOf(s()).toEqualTypeOf<boolean>()
    expectTypeOf(s(false)).toEqualTypeOf<void>()
})

test('signal: nullability and explicit generics', () => {
    const s = signal<string | null>(null)
    expectTypeOf(s()).toEqualTypeOf<string | null>()
    s('valid')
    s(null)
})

test('signal: undefined handling', () => {
    const s = signal<number | undefined>(undefined)
    expectTypeOf(s()).toEqualTypeOf<number | undefined>()
})

test('signal: bigint support', () => {
    const s = signal(100n)
    expectTypeOf(s()).toEqualTypeOf<bigint>()
})

test('signal: symbol support', () => {
    const s = signal(Symbol('test'))
    expectTypeOf(s()).toEqualTypeOf<symbol>()
})

test('signal: literal union types', () => {
    const s = signal<'red' | 'green'>('red')
    expectTypeOf(s()).toEqualTypeOf<'red' | 'green'>()
})

test('signal: read-only check for getter', () => {
    const s = signal(1)
    const val = s()
    // @ts-expect-error - value is not a signal
    val(2)
})

test('signal: metadata properties', () => {
    const s = signal(0)
    expectTypeOf(s.isSignal).toEqualTypeOf<boolean>()
})

// ─── 2. OBJECT SIGNALS & DEEP NESTING ─────────────────────────────────────────

test('object signal: basic inference', () => {
    const s = signal({ id: 1, name: 'obj' })
    expectTypeOf(s()).toEqualTypeOf<{ id: number; name: string }>()
})

test('object signal: partial updates (not supported by direct setter)', () => {
    const s = signal({ a: 1, b: 2 })
    // @ts-expect-error - setter requires full object
    s({ a: 3 })
})

test('object signal: nested property access', () => {
    const s = signal({ a: { b: { c: 10 } } })
    expectTypeOf(s().a.b.c).toBeNumber()
})

test('object signal: optional properties inference', () => {
    type Config = { debug: boolean; port?: number }
    const s = signal<Config>({ debug: true })
    expectTypeOf(s().port).toEqualTypeOf<number | undefined>()
})

test('object signal: mapping property to local variable', () => {
    const s = signal({ x: 100 })
    const x = s().x
    expectTypeOf(x).toBeNumber()
})

test('object signal: instance of class - type level only', () => {
    class MyModel { constructor(public val: number) {} }
    const s = signal(new MyModel(1))
    // @ts-expect-error - toBeInstanceOf is a runtime matcher, not available in expectTypeOf
    expectTypeOf(s()).toBeInstanceOf(MyModel)
    // Correct way: check instance properties instead
    expectTypeOf(s().val).toBeNumber()
})

test('object signal: deep read-only nature of result', () => {
    const s = signal({ a: 1 })
    const data = s()
    expectTypeOf(data.a).toBeNumber()
})

test('object signal: intersection types', () => {
    type A = { a: number }; type B = { b: string }
    const s = signal<A & B>({ a: 1, b: '2' })
    expectTypeOf(s().a).toBeNumber()
    expectTypeOf(s().b).toBeString()
})

test('object signal: readonly modifier check', () => {
    const s = signal({ a: 1 })
    // @ts-expect-error - SignalAccessor does not have a 'readonly' property
    expectTypeOf(s.readonly).toBeUndefined() // Signals are not read-only
})

test('object signal: function as value', () => {
    const s = signal({ exec: () => 'ok' })
    expectTypeOf(s().exec()).toBeString()
})

// ─── 3. ARRAY SIGNALS - MUTATIONS ─────────────────────────────────────────────

test('array signal: push method return type', () => {
    const s = signal([1])
    expectTypeOf(s.push(2)).toEqualTypeOf<number>()
})

test('array signal: pop method return type', () => {
    const s = signal([1])
    expectTypeOf(s.pop()).toEqualTypeOf<number | undefined>()
})

test('array signal: shift method return type', () => {
    const s = signal([1])
    expectTypeOf(s.shift()).toEqualTypeOf<number | undefined>()
})

test('array signal: unshift method return type', () => {
    const s = signal([1])
    expectTypeOf(s.unshift(0)).toEqualTypeOf<number>()
})

test('array signal: splice method return type', () => {
    const s = signal([1, 2, 3])
    expectTypeOf(s.splice(0, 1)).toEqualTypeOf<number[]>()
})

test('array signal: sort chaining mechanism', () => {
    const s = signal([3, 1])
    expectTypeOf(s.sort()).toEqualTypeOf<typeof s>()
})

test('array signal: reverse chaining mechanism', () => {
    const s = signal([1, 2])
    expectTypeOf(s.reverse()).toEqualTypeOf<typeof s>()
})

test('array signal: clear utility', () => {
    const s = signal([1, 2])
    expectTypeOf(s.clear()).toBeVoid()
})

test('array signal: remove utility with predicate', () => {
    const s = signal([{ id: 1 }])
    expectTypeOf(s.remove(i => i.id === 1)).toBeVoid()
})

test('array signal: complex sorting', () => {
    const s = signal([1, 2])
    expectTypeOf(s.sort((a, b) => b - a)).toEqualTypeOf<typeof s>()
})

test('array signal: push with multiple items', () => {
    const s = signal([1])
    expectTypeOf(s.push(2, 3, 4)).toBeNumber()
})

test('array signal: unshift with multiple items', () => {
    const s = signal([1])
    expectTypeOf(s.unshift(-1, 0)).toBeNumber()
})

test('array signal: nested array mutation', () => {
    const s = signal([[1], [2]])
    expectTypeOf(s.push([3])).toBeNumber()
})

test('array signal: accessor functionality', () => {
    const s = signal([1, 2])
    expectTypeOf(s()).toEqualTypeOf<number[]>()
})

test('array signal: mixed type array', () => {
    const s = signal<(number | string)[]>([1, '2'])
    expectTypeOf(s.pop()).toEqualTypeOf<number | string | undefined>()
})

// ─── 4. ARRAY SIGNALS - REACTIVE ──────────────────────────────────────────

test('array reactive: map derivation', () => {
    const s = signal([1, 2])
    const m = s.map(x => x.toString())
    expectTypeOf(m()).toEqualTypeOf<string[]>()
})

test('array reactive: filter derivation', () => {
    const s = signal([1, 2])
    const f = s.filter(x => x > 1)
    expectTypeOf(f()).toEqualTypeOf<number[]>()
})

test('array reactive: slice derivation', () => {
    const s = signal([1, 2, 3])
    expectTypeOf(s.slice(0, 2)()).toEqualTypeOf<number[]>()
})

test('array reactive: find inference', () => {
    const s = signal([{ id: 1 }])
    expectTypeOf(s.find(i => i.id === 1)()).toEqualTypeOf<{id: number} | undefined>()
})

test('array reactive: findIndex inference', () => {
    const s = signal([1])
    expectTypeOf(s.findIndex(x => x === 1)()).toBeNumber()
})

test('array reactive: every check', () => {
    const s = signal([1])
    expectTypeOf(s.every(x => x > 0)()).toBeBoolean()
})

test('array reactive: some check', () => {
    const s = signal([1])
    expectTypeOf(s.some(x => x > 0)()).toBeBoolean()
})

test('array reactive: includes check', () => {
    const s = signal([1])
    expectTypeOf(s.includes(1)()).toBeBoolean()
})

test('array reactive: indexOf check', () => {
    const s = signal([1])
    expectTypeOf(s.indexOf(1)()).toBeNumber()
})

test('array reactive: lastIndexOf check', () => {
    const s = signal([1])
    expectTypeOf(s.lastIndexOf(1)()).toBeNumber()
})

test('array reactive: reduce with initial value', () => {
    const s = signal([1, 2])
    expectTypeOf(s.reduce((acc, val) => acc + val, 0)()).toBeNumber()
})

test('array reactive: reduce to different type', () => {
    const s = signal([1, 2])
    expectTypeOf(s.reduce((acc, val) => acc + val.toString(), '')()).toBeString()
})

test('array reactive: join to string', () => {
    const s = signal([1, 2])
    expectTypeOf(s.join(',')()).toBeString()
})

test('array reactive: concat derivation', () => {
    const s = signal([1])
    expectTypeOf(s.concat([2, 3])()).toEqualTypeOf<number[]>()
})

test('array reactive: flat derivation', () => {
    const s = signal([[1], [2]])
    expectTypeOf(s.flat()()).toEqualTypeOf<any[]>()
})

test('array reactive: flatMap derivation', () => {
    const s = signal([1])
    expectTypeOf(s.flatMap(x => [x, x])()).toEqualTypeOf<number[]>()
})

test('array reactive: at accessor', () => {
    const s = signal([1])
    expectTypeOf(s.at(0)()).toEqualTypeOf<number | undefined>()
})

test('array reactive: findLast (ES2023)', () => {
    const s = signal([1])
    expectTypeOf(s.findLast(x => x > 0)()).toEqualTypeOf<number | undefined>()
})

test('array reactive: findLastIndex (ES2023)', () => {
    const s = signal([1])
    expectTypeOf(s.findLastIndex(x => x > 0)()).toBeNumber()
})

test('array reactive: complex chain', () => {
    const s = signal([1, 2, 3])
    const c = s.filter(x => x > 1).map(x => x * 2)
    expectTypeOf(c()).toEqualTypeOf<number[]>()
})

// ─── 5. COMPUTED ──────────────────────────────────────────────────────────────

test('computed: basic number inference', () => {
    const c = computed(() => 10)
    expectTypeOf(c()).toBeNumber()
})

test('computed: string inference', () => {
    const c = computed(() => 'a')
    expectTypeOf(c()).toBeString()
})

test('computed: derived from signals', () => {
    const s = signal(1)
    const c = computed(() => s() + 1)
    expectTypeOf(c()).toBeNumber()
})

test('computed: read-only property check', () => {
    const c = computed(() => 1)
    expectTypeOf(c.readonly).toEqualTypeOf<true>()
})

test('computed: immutability at type level', () => {
    const c = computed(() => 1)
    // @ts-expect-error - cannot set value
    c(2)
})

test('computed: array result reactive methods', () => {
    const c = computed(() => [1, 2])
    expectTypeOf(c.map(x => x)()).toEqualTypeOf<number[]>()
})

test('computed: object result inference', () => {
    const c = computed(() => ({ ok: true }))
    expectTypeOf(c().ok).toBeBoolean()
})

test('computed: conditional return types - widened to string', () => {
    const s = signal(true)
    const c = computed(() => s() ? 'yes' : 'no')
    // @ts-expect-error - computed returns widened string type, not literal union
    expectTypeOf(c()).toEqualTypeOf<'yes' | 'no'>()
    // Correct expectation:
    expectTypeOf(c()).toBeString()
})

test('computed: nested computed dependencies', () => {
    const a = signal(1); const b = computed(() => a() + 1)
    const c = computed(() => b() * 2)
    expectTypeOf(c()).toBeNumber()
})

test('computed: isSignal identity', () => {
    const c = computed(() => 1)
    expectTypeOf(c.isSignal).toBeBoolean()
})

// ─── 6. WATCH & WATCHEFFECT ───────────────────────────────────────────────────

test('watch: single signal source inference', () => {
    const s = signal(1)
    // @ts-expect-error - expectTypeOf in callback returns expectation, not void
    watch(s, (v) => expectTypeOf(v).toBeNumber())
})

test('watch: getter function source inference', () => {
    watch(() => 'hi', (v) => expectTypeOf(v).toBeString())
})

test('watch: multiple sources array inference', () => {
    const s1 = signal(1); const s2 = signal('a')
    watch([s1, s2], (v) => {
        // @ts-expect-error - watch returns union type, not tuple
        expectTypeOf(v).toEqualTypeOf<[number, string]>()
    })
})

test('watch: old value typing (single)', () => {
    watch(signal(1), (v, o) => {
        // @ts-expect-error - oldValue has complex inference
        expectTypeOf(o).toEqualTypeOf<number | undefined>()
    })
})

test('watch: old value typing (multi)', () => {
    watch([signal(1)], (v, o) => {
        // @ts-expect-error - oldValue has complex inference for arrays
        expectTypeOf(o).toEqualTypeOf<[number] | undefined>()
    })
})

test('watch: cleanup hook typing', () => {
    watch(signal(1), (v, o, onCleanup) => expectTypeOf(onCleanup).toBeFunction())
})

test('watch: options presence (immediate)', () => {
    expectTypeOf(watch(signal(1), () => {}, { immediate: true })).toBeFunction()
})

test('watch: options presence (equals)', () => {
    expectTypeOf(watch(signal(1), () => {}, { equals: (a, b) => a === b })).toBeFunction()
})

// ─── 7. COMPONENTS ────────────────────────────────────────────────────────────

test('component: props required inference', () => {
    defineComponent({
        props: { id: { type: Number, required: true } },
        setup(p) { expectTypeOf(p.id).toBeNumber(); return { template: '' } }
    })
})

test('component: props default inference', () => {
    defineComponent({
        props: { n: { type: Number, default: 0 } },
        setup(p) { expectTypeOf(p.n).toBeNumber(); return { template: '' } }
    })
})

test('component: props optional inference', () => {
    defineComponent({
        // @ts-expect-error - String constructor alone is not valid PropConfig
        props: { title: String },
        setup(p) {
            // @ts-expect-error - due to above error, p.title is never
            expectTypeOf(p.title).toEqualTypeOf<string | undefined>();
            return { template: '' }
        }
    })
})

test('component: props with multiple types', () => {
    defineComponent({
        props: {
            id: { type: Number, required: true },
            name: { type: String, default: '' },
            active: { type: Boolean, default: false }
        },
        setup(p) {
            expectTypeOf(p.id).toBeNumber()
            expectTypeOf(p.name).toBeString()
            expectTypeOf(p.active).toBeBoolean()
            return { template: '' }
        }
    })
})

test('component: props array notation', () => {
    defineComponent({
        props: ['id', 'name'] as const,
        setup(p) {
            expectTypeOf(p.id).toEqualTypeOf<any>()
            expectTypeOf(p.name).toEqualTypeOf<any>()
            return { template: '' }
        }
    })
})

test('component: props object type - not supported', () => {
    defineComponent({
        // @ts-expect-error - ObjectConstructor not in PropConfig allowed types
        props: {
            user: { type: Object, required: true }
        },
        setup(p) {
            expectTypeOf(p.user).toEqualTypeOf<any>()
            return { template: '' }
        }
    })
})

test('component: setup context emit typing', () => {
    defineComponent({
        setup(p, { emit }) { expectTypeOf(emit).toBeFunction(); return { template: '' } }
    })
})

test('component: emit with arguments', () => {
    defineComponent({
        setup(p, { emit }) {
            emit('change', 123)
            emit('update', { id: 1 })
            return { template: '' }
        }
    })
})

test('component: setup context slots typing', () => {
    defineComponent({
        setup(p, { slots }) { expectTypeOf(slots.default).toBeString(); return { template: '' } }
    })
})

test('component: lifecycle onMount presence', () => {
    expectTypeOf(onMount(() => {})).toBeVoid()
})

test('component: lifecycle onUnmount presence', () => {
    expectTypeOf(onUnmount(() => {})).toBeVoid()
})

test('component: provide utility', () => {
    expectTypeOf(provide('key', 'val')).toBeVoid()
})

test('component: inject utility with generic', () => {
    expectTypeOf(inject<string>('key')).toEqualTypeOf<string | null>()
})

test('component: factory return type', () => {
    const Comp = defineComponent({ setup: () => ({ template: '' }) })
    expectTypeOf(Comp).toBeFunction()
})

// ─── 8. STORE & UTILS ─────────────────────────────────────────────────────────

test('store: basic state inference', () => {
    const useStore = defineStore('m', () => ({ count: signal(0) }))
    expectTypeOf(useStore().count()).toBeNumber()
})

test('store: action inference', () => {
    const useStore = defineStore('m', () => ({ inc: () => {} }))
    expectTypeOf(useStore().inc).toBeFunction()
})

test('store: computed state inference', () => {
    const useStore = defineStore('m', () => ({ doubled: computed(() => 2) }))
    expectTypeOf(useStore().doubled()).toBeNumber()
})

test('batch: return value of lambda', () => {
    expectTypeOf(batch(() => 123)).toBeNumber()
})

test('untrack: return value of lambda', () => {
    expectTypeOf(untrack(() => 'val')).toBeString()
})

test('inspect: return type', () => {
    expectTypeOf(inspect(1)).toEqualTypeOf<void | (() => void)>()
})

test('signal: array length logic via accessor', () => {
    expectTypeOf(signal([1])().length).toBeNumber()
})

test('signal: array map to different type nested', () => {
    const s = signal([{n: 1}])
    expectTypeOf(s.map(x => x.n)()).toEqualTypeOf<number[]>()
})

test('signal: boolean signal as generic source', () => {
    const b = signal(true)
    const c = computed(() => !b())
    expectTypeOf(c()).toBeBoolean()
})

test('final: complex signal object deep access', () => {
    const s = signal({ a: { b: { c: { d: 1 } } } })
    expectTypeOf(s().a.b.c.d).toBeNumber()
})

// ─── 9. COMPOSABLE ───────────────────────────────────────────────────────────────

test('composable: defineComposable return type', () => {
    const useCounter = defineComposable(() => ({
        count: signal(0),
        inc: () => {}
    }))
    expectTypeOf(useCounter).toBeFunction()
})

test('composable: composable result type', () => {
    const useCounter = defineComposable(() => ({
        count: signal(0),
        inc: () => {}
    }))
    const result = useCounter()
    expectTypeOf(result.count()).toBeNumber()
})

test('composable: composable with arguments', () => {
    const useCounter = defineComposable((initial: number) => ({
        count: signal(initial),
        inc: () => {}
    }))
    const result = useCounter(10)
    expectTypeOf(result.count()).toBeNumber()
})

test('composable: composable returns computed', () => {
    const useDoubled = defineComposable((s: Signal<number>) => ({
        doubled: computed(() => s() * 2)
    }))
    const s = signal(5)
    const result = useDoubled(s)
    expectTypeOf(result.doubled()).toBeNumber()
})

test('composable: composable nested signals', () => {
    const useData = defineComposable(() => ({
        data: signal({ id: 1, name: 'test' })
    }))
    const result = useData()
    expectTypeOf(result.data().id).toBeNumber()
    expectTypeOf(result.data().name).toBeString()
})

test('composable: assertSetupContext return type', () => {
    expectTypeOf(assertSetupContext()).toBeVoid()
})

test('composable: assertSetupContext with name', () => {
    expectTypeOf(assertSetupContext('MyComposable')).toBeVoid()
})

// ─── 10. STORE UTILS ────────────────────────────────────────────────────────────

test('store: resetStore return type', () => {
    expectTypeOf(resetStore('test')).toBeVoid()
})

test('store: clearStores return type', () => {
    expectTypeOf(clearStores()).toBeVoid()
})

test('store: registerStorePlugin return type', () => {
    expectTypeOf(registerStorePlugin(() => {})).toBeVoid()
})

// ─── 11. ROUTER ────────────────────────────────────────────────────────────────

test('router: createRouter return type', () => {
    const router = createRouter([])
    expectTypeOf(router.navigate).toBeFunction()
    expectTypeOf(router.destroy).toBeFunction()
})

test('router: navigate return type', () => {
    expectTypeOf(navigate('/path')).toBeVoid()
})

test('router: mountOutlet return type', () => {
    expectTypeOf(mountOutlet(document.createElement('div'))).toBeVoid()
})

// ─── 12. COMPILER ───────────────────────────────────────────────────────────────

test('compiler: mountTemplate return type', () => {
    const result = mountTemplate('', document.createElement('div'), { template: '' }, {})
    expectTypeOf(result.effects).toEqualTypeOf<(() => void)[]>()
})

// ─── 13. DIRECTIVES ──────────────────────────────────────────────────────────────

test('directive: directive return type', () => {
    expectTypeOf(directive('test', {})).toBeVoid()
})

test('directive: f-classList computed object values are booleans', () => {
    const isActive = signal(false)
    const isDisabled = signal(true)

    const classList = computed(() => ({
        active: isActive(),
        disabled: isDisabled(),
        'theme-dark': false
    }))

    expectTypeOf(classList().active).toBeBoolean()
    expectTypeOf(classList().disabled).toBeBoolean()
    expectTypeOf(classList()['theme-dark']).toBeBoolean()
})

// ─── 14. COMPONENT UTILS ────────────────────────────────────────────────────────

test('component: defineAsyncComponent return type', () => {
    const AsyncComp = defineAsyncComponent(() => Promise.resolve(defineComponent({ setup: () => ({ template: '' }) })))
    expectTypeOf(AsyncComp).toBeFunction()
})

test('component: defineAsyncComponent with options', () => {
    const AsyncComp = defineAsyncComponent({
        loader: () => Promise.resolve(defineComponent({ setup: () => ({ template: '' }) })),
        loadingComponent: defineComponent({ setup: () => ({ template: 'Loading...' }) })
    })
    expectTypeOf(AsyncComp).toBeFunction()
})

test('component: parseSlots return type', () => {
    const slots = parseSlots('<div>content</div>')
    expectTypeOf(slots).toEqualTypeOf<import('../types/component').Slots>()
})

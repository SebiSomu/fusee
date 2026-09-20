import { hFor, hIf } from './h.js'

/**
 * Flattens JSX children into a single array of fnodes, dropping
 * booleans/null/undefined so `{cond && <Foo/>}` and `{cond ? <A/> : null}`
 * behave the way JSX authors expect. Recursively flattens nested arrays,
 * which is all Fragment needs: it returns its children as-is, and whatever
 * consumes those children (h()'s children arg, or another flattenChildren
 * call) inlines them automatically.
 */
export function flattenChildren(children) {
    const out = []
    const stack = Array.isArray(children) ? [...children] : [children]

    while (stack.length) {
        const child = stack.shift()
        if (child == null || child === false || child === true) continue
        if (Array.isArray(child)) {
            stack.unshift(...child)
            continue
        }
        out.push(child)
    }

    return out
}

/** JSX fragment marker: `<>...</>` compiles to Fragment({ children }). */
export function Fragment(props) {
    return flattenChildren(props?.children)
}

/**
 * Wraps a handler with modifiers for JSX event props, e.g.
 * `<button onClick={on(submit, ['prevent', 'once'])}>`.
 * Plain `onClick={fn}` (no modifiers) needs no wrapper at all.
 */
export function on(handler, modifiers = []) {
    return { __fuseeEvent: true, handler, modifiers }
}

/**
 * Converts JSX's `onClick={fn}` convention into the `{'@click': {handler, modifiers}}`
 * shape h.js's _applyProps already reads, since `@click` isn't valid JSX attribute
 * syntax. Every other prop (f-show, f-html, f-model, f-ref, f-once, plain attrs,
 * class, style) passes through unchanged — those are already valid JSX names and
 * h.js already special-cases the exact string keys.
 */
export function normalizeEventProps(rawProps = {}) {
    const props = {}

    for (const key in rawProps) {
        const match = /^on([A-Z][a-zA-Z]*)$/.exec(key)
        if (!match) {
            props[key] = rawProps[key]
            continue
        }

        const eventName = match[1].toLowerCase()
        const value = rawProps[key]
        const wrapped = value && typeof value === 'object' && value.__fuseeEvent

        props[`@${eventName}`] = {
            handler: wrapped ? value.handler : value,
            modifiers: wrapped ? value.modifiers : []
        }
    }

    return props
}

/**
 * Converts JSX's `onClose={fn}` convention into the `'on:close': fn` shape
 * createComponent already scans for. This is deliberately different from
 * normalizeEventProps: component listeners are plain callbacks invoked via
 * emit(), not native DOM events, so modifiers (prevent/stop/debounce/...)
 * don't apply here — a wrapped `on(fn, mods)` value has its modifiers
 * dropped with a warning rather than silently ignored.
 */
export function normalizeComponentListenerProps(rawProps = {}) {
    const props = {}

    for (const key in rawProps) {
        const match = /^on([A-Z][a-zA-Z]*)$/.exec(key)
        if (!match) {
            props[key] = rawProps[key]
            continue
        }

        const eventName = match[1].toLowerCase()
        const value = rawProps[key]
        const wrapped = value && typeof value === 'object' && value.__fuseeEvent

        if (wrapped && wrapped.modifiers && wrapped.modifiers.length) {
            console.warn(`[fusée] Event modifiers aren't supported on component listeners ("${key}"); ignoring.`)
        }

        props[`on:${eventName}`] = wrapped ? wrapped.handler : value
    }

    return props
}

/**
 * Splits a component's JSX children into fusée's rawSlots shape:
 * { default: () => fnode[], header: () => fnode[], ... }.
 * Plain children become the default slot; children wrapped in <Slot name="x">
 * are routed to that named slot instead.
 */
export function splitSlotChildren(children) {
    const flat = flattenChildren(children)
    const named = {}
    const defaultChildren = []

    for (const child of flat) {
        if (child && child._slotName) {
            const bucket = named[child._slotName] || (named[child._slotName] = [])
            bucket.push(...(child._slotNodes || []))
        } else {
            defaultChildren.push(child)
        }
    }

    const rawSlots = {}
    if (defaultChildren.length) rawSlots.default = () => defaultChildren
    for (const name in named) {
        const nodes = named[name]
        rawSlots[name] = () => nodes
    }

    return rawSlots
}

/** Marks its children as belonging to a named slot on the parent component. */
export function Slot(props) {
    return {
        node: null,
        effects: [],
        _slotName: props.name,
        _slotNodes: flattenChildren(props.children)
    }
}

/**
 * `<For each={items} key={item => item.id}>{(item, index) => <li>...</li>}</For>`
 * `each` should be a signal/getter. `key` is optional (defaults to index —
 * fine for static lists, but you'll want it for anything reorderable).
 * Compiles straight to hFor, preserving its keyed LIS-based reconciliation
 * instead of losing it to a plain `.map()`.
 */
export function For(props) {
    const sourceGetter = typeof props.each === 'function' ? props.each : () => props.each
    const renderItem = Array.isArray(props.children) ? props.children[0] : props.children
    const keyFn = props.key
        ? (itemGetter, index) => props.key(itemGetter(), index)
        : (_itemGetter, index) => index

    return hFor(sourceGetter, renderItem, keyFn)
}

/**
 * `<Show when={isReady} fallback={<Spinner/>}>{(value) => <Panel data={value}/>}</Show>`
 * `when` should be a signal/getter. `children` may be a render-prop function
 * receiving the truthy value of `when`, or static JSX. Compiles to hIf, so
 * branch swapping stays anchor-based instead of a full re-render.
 */
export function Show(props) {
    const condFn = typeof props.when === 'function' ? props.when : () => props.when

    const renderBranch = (value, source) =>
        flattenChildren(typeof source === 'function' ? source(value) : source)

    const branches = [[condFn, () => renderBranch(condFn(), props.children)]]

    if (props.fallback !== undefined) {
        branches.push([null, () => renderBranch(undefined, props.fallback)])
    }

    return hIf(branches)
}
import { hFor, hIf } from './h.js'

export function flattenChildren(children) {
    const out = []
    const stack = Array.isArray(children) ? [...children] : [children]

    while (stack.length) {
        const child = stack.shift()
        if (child == null || child === false || child === true) 
            continue
        if (Array.isArray(child)) {
            stack.unshift(...child)
            continue
        }
        out.push(child)
    }

    return out
}

export function Fragment(props) {
    return flattenChildren(props?.children)
}

export function on(handler, modifiers = []) {
    return { __fuseeEvent: true, handler, modifiers }
}

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
    if (defaultChildren.length) 
        rawSlots.default = () => defaultChildren
    for (const name in named) {
        const nodes = named[name]
        rawSlots[name] = () => nodes
    }

    return rawSlots
}

export function Slot(props) {
    return {
        node: null,
        effects: [],
        _slotName: props.name,
        _slotNodes: flattenChildren(props.children)
    }
}

export function For(props) {
    const sourceGetter = typeof props.each === 'function' ? props.each : () => props.each
    const renderItem = Array.isArray(props.children) ? props.children[0] : props.children
    const keyFn = props.key
        ? (itemGetter, index) => props.key(itemGetter(), index)
        : (_itemGetter, index) => index

    return hFor(sourceGetter, renderItem, keyFn)
}

export function Show(props) {
    const condFn = typeof props.when === 'function' ? props.when : () => props.when
    const renderBranch = (value, source) => flattenChildren(typeof source === 'function' ? source(value) : source)
    const branches = [[condFn, () => renderBranch(condFn(), props.children)]]

    if (props.fallback !== undefined) {
        branches.push([null, () => renderBranch(undefined, props.fallback)])
    }

    return hIf(branches)
}
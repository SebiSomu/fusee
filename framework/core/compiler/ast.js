export const NodeType = {
    ROOT: 'Root',
    ELEMENT: 'Element',
    COMPONENT: 'Component',
    TEXT: 'Text',
    INTERPOLATION: 'Interpolation',
    EXPRESSION: 'Expression',
    ATTRIBUTE: 'Attribute',
    BINDING: 'Binding',
    EVENT: 'Event',
    DIRECTIVE: 'Directive',
    SLOT_OUTLET: 'SlotOutlet',
    SLOT_CONTENT: 'SlotContent',
}

export function createLoc(start, end, source) {
    return { start, end, source }
}

export function createPos(line, col, offset) {
    return { line, col, offset }
}

export function createRoot(children = [], loc = null) {
    return { type: NodeType.ROOT, children, loc }
}

export function createElement(tag, props = [], children = [], selfClosing = false, loc = null) {
    return {
        type: NodeType.ELEMENT,
        tag,
        props,
        children,
        selfClosing,
        isStatic: false,
        hoisted: false,
        loc
    }
}

export function createComponent(name, props = [], slots = {}, loc = null) {
    return {
        type: NodeType.COMPONENT,
        name,
        props,
        slots,
        loc
    }
}

export function createText(content, loc = null) {
    return { type: NodeType.TEXT, content, loc }
}

export function createInterpolation(expression, loc = null) {
    return {
        type: NodeType.INTERPOLATION,
        expression,
        loc
    }
}

export function createExpression(content, isStatic = false, loc = null) {
    return {
        type: NodeType.EXPRESSION,
        content,
        isStatic,
        loc
    }
}

export function createAttribute(name, value, loc = null) {
    return {
        type: NodeType.ATTRIBUTE,
        name,
        value,
        loc
    }
}

export function createBinding(name, expression, isProp = false, loc = null) {
    return {
        type: NodeType.BINDING,
        name,
        expression,
        isProp,
        loc
    }
}

export function createEvent(name, expression, modifiers = [], loc = null) {
    return {
        type: NodeType.EVENT,
        name,
        expression,
        modifiers,
        loc
    }
}

export function createDirective(name, expression = null, arg = null, loc = null) {
    return {
        type: NodeType.DIRECTIVE,
        name,
        expression,
        arg,
        loc
    }
}

export function createSlotOutlet(slotName = 'default', fallback = [], loc = null) {
    return {
        type: NodeType.SLOT_OUTLET,
        slotName,
        fallback,
        loc
    }
}

export function createSlotContent(slotName = 'default', children = [], loc = null) {
    return {
        type: NodeType.SLOT_CONTENT,
        slotName,
        children,
        loc
    }
}

export function createForArg(item, source, index = null, loc = null) {
    return { item, source, index, loc }
}

export function isElement(node) {
    return node?.type === NodeType.ELEMENT
}

export function isComponent(node) {
    return node?.type === NodeType.COMPONENT
}

export function isText(node) {
    return node?.type === NodeType.TEXT
}

export function isInterpolation(node) {
    return node?.type === NodeType.INTERPOLATION
}

export function isDirective(node, name) {
    return node?.type === NodeType.DIRECTIVE && (name == null || node.name === name)
}

export function isStaticText(node) {
    return node?.type === NodeType.TEXT ||
        (node?.type === NodeType.INTERPOLATION && node.expression?.isStatic)
}

export function findDirective(element, name) {
    return element.props.find(p => isDirective(p, name)) ?? null
}

export function getEvents(element) {
    return element.props.filter(p => p.type === NodeType.EVENT)
}

export function cloneNode(node) {
    return { ...node, props: node.props ? [...node.props] : undefined, children: node.children ? [...node.children] : undefined }
}
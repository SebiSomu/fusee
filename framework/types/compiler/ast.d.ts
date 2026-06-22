export declare const NodeType: {
    readonly ROOT: 'Root'
    readonly ELEMENT: 'Element'
    readonly COMPONENT: 'Component'
    readonly TEXT: 'Text'
    readonly INTERPOLATION: 'Interpolation'
    readonly EXPRESSION: 'Expression'
    readonly ATTRIBUTE: 'Attribute'
    readonly BINDING: 'Binding'
    readonly EVENT: 'Event'
    readonly DIRECTIVE: 'Directive'
    readonly SLOT_OUTLET: 'SlotOutlet'
    readonly SLOT_CONTENT: 'SlotContent'
}

export type NodeTypeValue = typeof NodeType[keyof typeof NodeType]

export interface Position {
    line: number
    col: number
    offset: number
}

export interface SourceLocation {
    start: Position
    end: Position
    source?: string
}

export interface BaseNode {
    type: NodeTypeValue | 'If'
    loc: SourceLocation | null
}

export interface RootNode extends BaseNode {
    type: 'Root'
    children: ChildNode[]
    _hoisted?: AnyNode[]
}

export interface ElementNode extends BaseNode {
    type: 'Element'
    tag: string
    props: PropNode[]
    children: ChildNode[]
    selfClosing: boolean
    isStatic: boolean
    hoisted: boolean
}

export interface ComponentNode extends BaseNode {
    type: 'Component'
    name: string
    props: PropNode[]
    slots: Record<string, ChildNode[]>
    isStatic: boolean
}

export interface TextNode extends BaseNode {
    type: 'Text'
    content: string
    isStatic: true
}

export interface InterpolationNode extends BaseNode {
    type: 'Interpolation'
    expression: ExpressionNode
    isStatic: boolean
}

export interface ExpressionNode extends BaseNode {
    type: 'Expression'
    content: string
    isStatic: boolean
    _isForKey?: boolean
}

export interface AttributeNode extends BaseNode {
    type: 'Attribute'
    name: string
    value: string | null
}

export interface BindingNode extends BaseNode {
    type: 'Binding'
    name: string
    expression: ExpressionNode
    isProp: boolean
}

export interface EventNode extends BaseNode {
    type: 'Event'
    name: string
    expression: ExpressionNode
    modifiers: string[]
}

export type DirectiveName = 'if' | 'else-if' | 'else' | 'for' | 'model' | 'show' | 'once' | 'ref' | 'html' | string

export interface DirectiveNode extends BaseNode {
    type: 'Directive'
    name: DirectiveName
    expression: ExpressionNode | null
    arg: ForArg | null
}

export interface SlotOutletNode extends BaseNode {
    type: 'SlotOutlet'
    slotName: string
    fallback: ChildNode[]
}

export interface SlotContentNode extends BaseNode {
    type: 'SlotContent'
    slotName: string
    children: ChildNode[]
}

export interface IfNode {
    type: 'If'
    branches: IfBranch[]
    loc: SourceLocation | null
    isStatic: false
}

export interface IfBranch {
    condition: ExpressionNode | null
    node: ElementNode | ComponentNode
}

export interface ForArg {
    item: string
    source: string
    index: string | null
    loc: SourceLocation | null
}

export type PropNode = AttributeNode | BindingNode | EventNode | DirectiveNode
export type ChildNode = ElementNode | ComponentNode | TextNode | InterpolationNode | SlotOutletNode | SlotContentNode | IfNode
export type AnyNode = RootNode | ChildNode | PropNode | ExpressionNode | ForArg

export declare function createLoc(start: Position, end: Position, source?: string): SourceLocation
export declare function createPos(line: number, col: number, offset: number): Position
export declare function createRoot(children?: ChildNode[], loc?: SourceLocation | null): RootNode
export declare function createElement(tag: string, props?: PropNode[], children?: ChildNode[], selfClosing?: boolean, loc?: SourceLocation | null): ElementNode
export declare function createComponent(name: string, props?: PropNode[], slots?: Record<string, ChildNode[]>, loc?: SourceLocation | null): ComponentNode
export declare function createText(content: string, loc?: SourceLocation | null): TextNode
export declare function createInterpolation(expression: ExpressionNode, loc?: SourceLocation | null): InterpolationNode
export declare function createExpression(content: string, isStatic?: boolean, loc?: SourceLocation | null): ExpressionNode
export declare function createAttribute(name: string, value: string | null, loc?: SourceLocation | null): AttributeNode
export declare function createBinding(name: string, expression: ExpressionNode, isProp?: boolean, loc?: SourceLocation | null): BindingNode
export declare function createEvent(name: string, expression: ExpressionNode, modifiers?: string[], loc?: SourceLocation | null): EventNode
export declare function createDirective(name: DirectiveName, expression?: ExpressionNode | null, arg?: ForArg | null, loc?: SourceLocation | null): DirectiveNode
export declare function createSlotOutlet(slotName?: string, fallback?: ChildNode[], loc?: SourceLocation | null): SlotOutletNode
export declare function createSlotContent(slotName?: string, children?: ChildNode[], loc?: SourceLocation | null): SlotContentNode
export declare function createForArg(item: string, source: string, index?: string | null, loc?: SourceLocation | null): ForArg

export declare function isElement(node: AnyNode | null | undefined): node is ElementNode
export declare function isComponent(node: AnyNode | null | undefined): node is ComponentNode
export declare function isText(node: AnyNode | null | undefined): node is TextNode
export declare function isInterpolation(node: AnyNode | null | undefined): node is InterpolationNode
export declare function isDirective(node: AnyNode | null | undefined, name?: DirectiveName): node is DirectiveNode
export declare function isStaticText(node: AnyNode | null | undefined): boolean
export declare function findDirective(element: ElementNode | ComponentNode, name: DirectiveName): DirectiveNode | null
export declare function getEvents(element: ElementNode | ComponentNode): EventNode[]
export declare function cloneNode<T extends AnyNode>(node: T): T
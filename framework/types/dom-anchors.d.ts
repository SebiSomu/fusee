export interface AnchorDescriptor {
    type: 'f-bind' | 'f-if' | 'f-for' | 'f-for-item' | 'f-component' | 'f-slot' | 'element'
    id: string
    name?: string
    key?: string
    startNode?: Comment
    endNode?: Comment
    element?: Element
    children?: AnchorDescriptor[]
}

export declare function findAnchors(root: Element | DocumentFragment | Document): AnchorDescriptor[]
export declare function flattenAnchors(anchors: AnchorDescriptor[]): AnchorDescriptor[]
export declare function getBoundTextNode(anchor: AnchorDescriptor): Text | null
export declare function clearBetween(startNode: Node, endNode: Node): void
export declare function insertHtmlBefore(endNode: Node, html: string): void
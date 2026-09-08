export function findAnchors(root) {
    const anchors = []
    const stack = []

    const SHOW_ELEMENT_AND_COMMENT = 0x81
    const walker = root.ownerDocument
        ? root.ownerDocument.createTreeWalker(root, SHOW_ELEMENT_AND_COMMENT, null)
        : root.createTreeWalker
            ? root.createTreeWalker(root, SHOW_ELEMENT_AND_COMMENT, null)
            : null

    if (!walker) throw new Error('[fusee] findAnchors requires a DOM environment (Document/TreeWalker)')

    let node = walker.nextNode()
    while (node) {
        if (node.nodeType === 8 /* COMMENT_NODE */) {
            const text = node.data.trim()
            const open = /^(f-bind|f-if|f-for|f-component|f-slot):(.+)$/.exec(text)
            const openItem = /^f-for-item:([^:]+):(.*)$/.exec(text)
            const close = /^\/(f-bind|f-if|f-for|f-component|f-slot):(.+)$/.exec(text)
            const closeItem = /^\/f-for-item:(.+)$/.exec(text)

            if (open) {
                const [, kind, rest] = open
                if (kind === 'f-component') {
                    const [name, id] = rest.split(':')
                    stack.push({ kind, id, name, startNode: node, children: [] })
                } else {
                    stack.push({ kind, id: rest, startNode: node, children: [] })
                }
            } else if (openItem) {
                const [, forId, key] = openItem
                stack.push({ kind: 'f-for-item', id: forId, key, startNode: node, children: [] })
            } else if (close || closeItem) {
                const frame = stack.pop()
                if (!frame) {
                    node = walker.nextNode()
                    continue
                }
                frame.endNode = node
                const descriptor = {
                    type: frame.kind,
                    id: frame.id,
                    name: frame.name,
                    key: frame.key,
                    startNode: frame.startNode,
                    endNode: frame.endNode
                }
                const parent = stack.length ? stack[stack.length - 1] : null
                if (parent) parent.children.push(descriptor)
                else anchors.push(descriptor)
            }
        } else if (node.nodeType === 1 /* ELEMENT_NODE */ && node.hasAttribute('data-f-id')) {
            const descriptor = {
                type: 'element',
                id: node.getAttribute('data-f-id'),
                element: node
            }
            const parent = stack.length ? stack[stack.length - 1] : null
            if (parent) parent.children.push(descriptor)
            else anchors.push(descriptor)
        }
        node = walker.nextNode()
    }

    return anchors
}

export function flattenAnchors(anchors) {
    const out = []
    for (const a of anchors) {
        out.push(a)
        if (a.children && a.children.length) {
            out.push(...flattenAnchors(a.children))
        }
    }
    return out
}

export function getBoundTextNode(anchor) {
    if (anchor.type !== 'f-bind') return null
    const node = anchor.startNode.nextSibling
    if (node && node.nodeType === 3 /* TEXT_NODE */) return node
    return null
}

export function clearBetween(startNode, endNode) {
    let node = startNode.nextSibling
    while (node && node !== endNode) {
        const next = node.nextSibling
        node.parentNode.removeChild(node)
        node = next
    }
}

export function insertHtmlBefore(endNode, html) {
    const doc = endNode.ownerDocument
    const template = doc.createElement('template')
    template.innerHTML = html
    const frag = template.content
    endNode.parentNode.insertBefore(frag, endNode)
}
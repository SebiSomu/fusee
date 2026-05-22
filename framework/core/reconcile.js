export function reconcileArrays(parentNode, anchor, oldList, newList, keyFn, createFn, updateFn) {
    let oldEnd = oldList.length - 1;
    let newEnd = newList.length - 1;
    let oldStart = 0;
    let newStart = 0;

    let oldStartNode = oldList[oldStart];
    let oldEndNode = oldList[oldEnd];
    let newStartItem = newList[newStart];
    let newEndItem = newList[newEnd];

    const nextOrder = new Array(newList.length);

    while (oldStart <= oldEnd && newStart <= newEnd) {
        if (oldStartNode === null) {
            oldStartNode = oldList[++oldStart];
        } else if (oldEndNode === null) {
            oldEndNode = oldList[--oldEnd];
        } else if (keyFn(oldStartNode) === keyFn(newStartItem)) {
            updateFn(oldStartNode, newStartItem, newStart);
            nextOrder[newStart] = oldStartNode;
            oldStartNode = oldList[++oldStart];
            newStartItem = newList[++newStart];
        } else if (keyFn(oldEndNode) === keyFn(newEndItem)) {
            updateFn(oldEndNode, newEndItem, newEnd);
            nextOrder[newEnd] = oldEndNode;
            oldEndNode = oldList[--oldEnd];
            newEndItem = newList[--newEnd];
        } else if (keyFn(oldStartNode) === keyFn(newEndItem)) {
            updateFn(oldStartNode, newEndItem, newEnd);
            const nextSibling = oldEndNode.node.nextSibling;
            parentNode.insertBefore(oldStartNode.node, nextSibling === anchor ? anchor : nextSibling);
            nextOrder[newEnd] = oldStartNode;
            oldStartNode = oldList[++oldStart];
            newEndItem = newList[--newEnd];
        } else if (keyFn(oldEndNode) === keyFn(newStartItem)) {
            updateFn(oldEndNode, newStartItem, newStart);
            parentNode.insertBefore(oldEndNode.node, oldStartNode.node);
            nextOrder[newStart] = oldEndNode;
            oldEndNode = oldList[--oldEnd];
            newStartItem = newList[++newStart];
        } else {
            break;
        }
    }

    if (oldStart > oldEnd) {
        for (; newStart <= newEnd; ++newStart) {
            const nextPos = newStart + 1;
            const refNode = nextPos < newList.length && nextOrder[nextPos] ? nextOrder[nextPos].node : (oldStart < oldList.length && oldList[oldStart] ? oldList[oldStart].node : anchor);
            const newNode = createFn(newList[newStart], newStart);
            parentNode.insertBefore(newNode.node, refNode);
            nextOrder[newStart] = newNode;
        }
    } else if (newStart > newEnd) {
        for (; oldStart <= oldEnd; ++oldStart) {
            if (oldList[oldStart]) {
                const node = oldList[oldStart];
                node.node.remove();
                if (node.effects) {
                    node.effects.forEach(cleanup => typeof cleanup === 'function' && cleanup());
                }
            }
        }
    } else {
        const keyToIndex = new Map();
        for (let i = newStart; i <= newEnd; ++i) {
            keyToIndex.set(keyFn(newList[i]), i);
        }

        let nodesToMove = 0;
        let lastIndex = 0;
        const newIndexToOldIndexMap = new Array(newEnd - newStart + 1).fill(0);

        for (let i = oldStart; i <= oldEnd; ++i) {
            const oldNode = oldList[i];
            if (!oldNode) continue;

            const newIndex = keyToIndex.get(keyFn(oldNode));
            if (newIndex === undefined) {
                oldNode.node.remove();
                if (oldNode.effects) {
                    oldNode.effects.forEach(cleanup => typeof cleanup === 'function' && cleanup());
                }
            } else {
                updateFn(oldNode, newList[newIndex], newIndex);
                newIndexToOldIndexMap[newIndex - newStart] = i + 1;
                if (newIndex >= lastIndex) {
                    lastIndex = newIndex;
                } else {
                    nodesToMove++;
                }
                nextOrder[newIndex] = oldNode;
            }
        }

        for (let i = newEnd - newStart; i >= 0; i--) {
            const newIndex = i + newStart;
            const nextPos = newIndex + 1;
            const refNode = nextPos < nextOrder.length && nextOrder[nextPos] ? nextOrder[nextPos].node : anchor;

            if (newIndexToOldIndexMap[i] === 0) {
                const newNode = createFn(newList[newIndex], newIndex);
                parentNode.insertBefore(newNode.node, refNode);
                nextOrder[newIndex] = newNode;
            } else if (nodesToMove > 0) {
                let currentPosIndex = i;
                const oldNode = nextOrder[newIndex];
                if (oldNode.node.nextSibling !== refNode) {
                    parentNode.insertBefore(oldNode.node, refNode);
                }
            }
        }
    }

    return nextOrder;
}

export function reconcile(container, oldList, newList, keyFn, createFn) {
    if (!container._renderedNodes) {
        container._renderedNodes = [];
    }

    const mappedOldList = container._renderedNodes;
    const mappedNewList = newList.map((item, index) => ({
        item: item,
        key: keyFn(item),
        rawIndex: index
    }));

    const nextOrder = reconcileArrays(
        container,
        null,
        mappedOldList,
        mappedNewList,
        (x) => x.key,
        (newItem) => {
            const domNode = createFn(newItem.item);
            return {
                node: domNode,
                item: newItem.item,
                key: newItem.key
            };
        },
        (oldNode, newItem) => {
            oldNode.item = newItem.item;
        }
    );

    container._renderedNodes = nextOrder;
}

export function reconcile<T = any>(
    container: Element,
    oldList: T[],
    newList: T[],
    keyFn: (item: T) => any,
    createFn: (item: T) => Element
): void;

export const config = {
    defaultSwap: 'innerHTML',
    /** Attribute prefix. Not intended to be changed at runtime in practice —
     *  exposed mainly so tests can verify nothing is hardcoded needlessly. */
    attrPrefix: 'comet-',
    /** Class toggled on an element (or its comet-indicator target) while a request is in flight. */
    requestingClass: 'comet-requesting',
    /** Default request timeout in ms. 0 disables the timeout. */
    timeout: 0,
    /** Optional hydrator hook called on newly swapped DOM nodes: (node, detail) => void */
    hydrator: null,
    /** Optional cleanup hook called on DOM targets before they are replaced/removed: (target, swapMode) => void */
    cleanup: null,
}
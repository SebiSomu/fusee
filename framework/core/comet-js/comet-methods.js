export const ATTR = {
    get: 'comet-get',
    post: 'comet-post',
    put: 'comet-put',
    patch: 'comet-patch',
    delete: 'comet-delete',
    trigger: 'comet-trigger',
    target: 'comet-target',
    swap: 'comet-swap',
    vals: 'comet-vals',
    include: 'comet-include',
    pushUrl: 'comet-push-url',
    indicator: 'comet-indicator',
    confirm: 'comet-confirm',
    swapOob: 'comet-swap-oob',
    boost: 'comet-boost',
}

export const METHOD_ATTRS = [
    ['get', ATTR.get],
    ['post', ATTR.post],
    ['put', ATTR.put],
    ['patch', ATTR.patch],
    ['delete', ATTR.delete],
]

export const DEFAULT_TRIGGER_BY_TAG = {
    FORM: 'submit',
    INPUT: 'change',
    TEXTAREA: 'change',
    SELECT: 'change',
}
export type CometTriggerSpec = {
    event?: string | null
    poll?: number
    once?: boolean
    changed?: boolean
    delay?: number
    throttle?: number
    from?: string | null
}

export type CometRequestConfig = {
    method: string
    url: string | null
}

export type CometOobSwap = {
    el: Element
    mode: string
    targetSelector: string | null
}

export type CometApi = {
    init(root: Element): void
    process(element: Element): void
    config: {
        defaultSwap: string
        attrPrefix: string
        requestingClass: string
        timeout: number
    }
    parseTriggerSpec(raw: string | null): CometTriggerSpec[]
    getRequestConfig(element: Element): CometRequestConfig | null
    gatherParams(element: Element): URLSearchParams
    swap(target: Element, html: string, mode: string): Node[]
    extractOOBSwaps(html: string, document: Document): {
        mainHTML: string
        oobSwaps: CometOobSwap[]
    }
}

export function parseTriggerSpec(raw: string | null): CometTriggerSpec[]
export function getRequestConfig(element: Element): CometRequestConfig | null
export function gatherParams(element: Element): URLSearchParams
export function swap(target: Element, html: string, mode: string): Node[]
export function extractOOBSwaps(html: string, document: Document): {
    mainHTML: string
    oobSwaps: CometOobSwap[]
}
export function performRequest(element: Element, triggerEvent: Event | null): Promise<void>
export function wireElement(element: Element): void
export function process(element: Element): void
export function init(root: Element): void
export function stopObserving(): void

declare global {
    interface Window {
        Comet?: CometApi
    }
}

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

export type CometConfig = {
    defaultSwap: string
    attrPrefix: string
    requestingClass: string
    timeout: number
    hydrator: ((node: Node, detail: any) => void) | null
    cleanup: ((target: Element, mode: string) => void) | null
}

export type CometApi = {
    init(root: Element): void
    process(element: Element): void
    config: CometConfig
    parseTriggerSpec(raw: string | null): CometTriggerSpec[]
    getRequestConfig(element: Element): CometRequestConfig | null
    gatherParams(element: Element): URLSearchParams
    swap(target: Element, html: string, mode: string): Node[]
    extractOOBSwaps(html: string, document: Document): {
        mainHTML: string
        oobSwaps: CometOobSwap[]
    }
    setHydrator(fn: ((node: Node, detail: any) => void) | null): void
    setCleanup(fn: ((target: Element, mode: string) => void) | null): void
}

export declare const config: CometConfig
export declare const ATTR: Record<string, string>

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
export function setHydrator(fn: ((node: Node, detail: any) => void) | null): void
export function setCleanup(fn: ((target: Element, mode: string) => void) | null): void

declare global {
    interface Window {
        Comet?: CometApi
    }
}

import { setHydrator, setCleanup } from './comet.js'
import { compileNode } from '../compiler.js'
import { loadHydration } from '../hydration.js'
import { loadSignalRegistry } from '../signal-scope.js'

const nodeCleanups = new WeakMap()
const activeElements = new Set()

/**
 * Extracts and loads any embedded Fusée state payload from a node subtree.
 */
export function extractAndApplyEmbeddedState(root) {
    if (!root || root.nodeType !== 1) return

    const scripts = []
    if (root.matches && (root.matches('script[data-fusee-state]') || root.id === '__FUSEE_DATA__')) {
        scripts.push(root)
    }
    if (root.querySelectorAll) {
        root.querySelectorAll('script[data-fusee-state], script#__FUSEE_DATA__').forEach(s => scripts.push(s))
    }

    for (const script of scripts) {
        try {
            let text = script.textContent.trim()
            if (text.startsWith('window.__FUSEE_STATE__')) {
                text = text.replace(/^window\.__FUSEE_STATE__\s*=\s*/, '').replace(/;$/, '')
            }
            if (text) {
                const payload = JSON.parse(text)
                if (payload.resources) loadHydration(payload.resources)
                if (payload.signals) loadSignalRegistry(payload.signals)
            }
            script.remove()
        } catch (err) {
            console.warn('[fusée:comet] failed to parse embedded hydration payload:', err)
        }
    }
}

/**
 * Hydrates a newly inserted DOM node with Fusée reactivity and components.
 */
export function hydrateFragment(node, context = {}, components = {}, opts = {}) {
    if (!node || node.nodeType !== 1) return []

    if (opts.autoExtractState !== false) {
        extractAndApplyEmbeddedState(node)
    }

    const effects = []
    compileNode(node, context, components, effects)

    if (effects.length > 0) {
        nodeCleanups.set(node, effects)
        activeElements.add(node)
    }

    return effects
}

/**
 * Cleans up reactive effects, component instances, and subscriptions attached to a DOM subtree.
 */
export function cleanupFragment(target) {
    if (!target || target.nodeType !== 1) return

    const toClean = []
    for (const el of activeElements) {
        if (el === target || target.contains(el)) {
            toClean.push(el)
        }
    }

    for (const el of toClean) {
        const cleanups = nodeCleanups.get(el)
        if (cleanups) {
            for (let i = cleanups.length - 1; i >= 0; i--) {
                const cleanup = cleanups[i]
                if (typeof cleanup === 'function') {
                    try {
                        cleanup()
                    } catch (err) {
                        console.error('[fusée:comet] error during node effect cleanup:', err)
                    }
                }
            }
            nodeCleanups.delete(el)
        }
        activeElements.delete(el)
    }
}

/**
 * Enables automatic Fusée hydration for Comet DOM swaps.
 */
export function enableFuseeHydration(options = {}) {
    const components = options.components || {}
    const context = options.context || {}
    const autoExtractState = options.autoExtractState !== false

    setCleanup((target) => {
        cleanupFragment(target)
    })

    setHydrator((node) => {
        hydrateFragment(node, context, components, { autoExtractState })
    })

    return function disableFuseeHydration() {
        setCleanup(null)
        setHydrator(null)
    }
}

import { effect, batch, signal, untrack } from '../core/signal.js';
import { createEventHandler, registerDelegatedEvent, isDelegatedEvent } from '../core/event-delegation.js';

export { effect as _effect, batch as _batch };

// ─── Template & DOM Primitives ─────────────────────────────────────────────────

export function _template(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstChild;
}

export function _createTextNode(text) {
    return document.createTextNode(text);
}

export function _walk(node, path) {
    let current = node;
    for (let i = 0; i < path.length; i++) {
        current = current.childNodes[path[i]];
    }
    return current;
}

// ─── Granular Property Setters ─────────────────────────────────────────────────

export function _setText(node, value) {
    node.data = String(value ?? '');
}

export function _setClass(el, value) {
    if (typeof value === 'string') {
        el.className = value;
    } else if (Array.isArray(value)) {
        el.className = value.filter(Boolean).join(' ');
    } else if (value && typeof value === 'object') {
        el.className = Object.entries(value).filter(([, v]) => !!v).map(([k]) => k).join(' ');
    } else {
        el.className = '';
    }
}

export function _setStyle(el, value) {
    if (value !== null && typeof value === 'object') {
        for (const k in value) el.style[k] = value[k];
    } else {
        el.style.cssText = String(value ?? '');
    }
}

export function _setProp(el, name, value) {
    el[name] = value;
}

const SENSITIVE_ATTRS = new Set(['href', 'src', 'srcset', 'formaction', 'xlink:href', 'data']);

export function _setAttr(el, name, value) {
    if (name in el && typeof el[name] !== 'undefined' && name !== 'type' && name !== 'class' && name !== 'style') {
        try {
            el[name] = value;
            return;
        } catch (_) {}
    }

    if (typeof value === 'boolean') {
        value ? el.setAttribute(name, '') : el.removeAttribute(name);
        return;
    }

    if (value == null) {
        el.removeAttribute(name);
        return;
    }

    let strVal = String(value);
    if (SENSITIVE_ATTRS.has(name.toLowerCase()) && /^(javascript|data|vbscript|file):/i.test(strVal.trim())) {
        console.warn(`[fusée] Blocked potential XSS on "${name}": "${strVal}"`);
        strVal = 'about:blank';
    }

    el.setAttribute(name, strVal);
}

// ─── Event Binding ─────────────────────────────────────────────────────────────

export function _on(el, eventName, handler, modifiers = []) {
    const handlerState = { timeoutId: null, throttleTimeoutId: null, lastRun: 0 };
    const wrappedHandler = createEventHandler(handler, modifiers, null, null, handlerState);

    if (isDelegatedEvent(eventName)) {
        registerDelegatedEvent(el, eventName, wrappedHandler, { modifiers, handlerState });
    } else {
        el.addEventListener(eventName, wrappedHandler);
    }
}

// ─── Dynamic Insert (granular DOM reconciliation) ──────────────────────────────

export function _insert(parent, accessor, marker = null, current = null) {
    if (typeof accessor === 'function') {
        effect(() => {
            current = _insertValue(parent, accessor(), marker, current);
        });
        return current;
    }
    return _insertValue(parent, accessor, marker, current);
}

function _insertValue(parent, value, marker, current) {
    if (value == null) value = '';

    // Fast path: text-to-text update (no DOM node creation)
    if (typeof value !== 'object' && !(value instanceof Node)) {
        const strVal = String(value);
        if (current && current instanceof Text) {
            if (current.data !== strVal) current.data = strVal;
            return current;
        }
        value = document.createTextNode(strVal);
    }

    if (Array.isArray(value)) {
        // Clean up previous nodes
        if (current) {
            const prev = Array.isArray(current) ? current : [current];
            prev.forEach(node => node && node.parentNode && node.parentNode.removeChild(node));
        }

        const fragment = document.createDocumentFragment();
        const nodes = value.map(a => {
            const n = a instanceof Node ? a : document.createTextNode(String(a));
            fragment.appendChild(n);
            return n;
        });
        parent.insertBefore(fragment, marker);
        return nodes;
    }

    // Single node insertion
    const node = value instanceof Node ? value : document.createTextNode(String(value));

    if (current) {
        if (Array.isArray(current)) {
            // Replace array of nodes with single node
            current.slice(1).forEach(c => c.parentNode && c.parentNode.removeChild(c));
            if (current[0] && current[0].parentNode) {
                parent.replaceChild(node, current[0]);
            } else {
                parent.insertBefore(node, marker);
            }
        } else if (current.parentNode) {
            parent.replaceChild(node, current);
        }
    } else {
        parent.insertBefore(node, marker);
    }

    return node;
}

// ─── Conditional Rendering (f-if / f-else-if / f-else) ─────────────────────────

export function _hIf(branches) {
    const anchor = document.createComment('f-if');
    let currentNodes = null;
    let currentBranch = -1;
    // Branch cache: lazily created, reused on re-activation
    const branchCache = new Array(branches.length).fill(null);

    effect(() => {
        let matchIdx = -1;
        for (let i = 0; i < branches.length; i++) {
            const [cond] = branches[i];
            if (cond === null || cond()) { matchIdx = i; break; }
        }

        if (matchIdx === currentBranch) return;

        const parentEl = anchor.parentNode;

        // Detach current branch nodes (don't destroy — may be re-used)
        if (currentNodes) {
            const arr = Array.isArray(currentNodes) ? currentNodes : [currentNodes];
            arr.forEach(n => n.parentNode && n.parentNode.removeChild(n));
        }

        currentBranch = matchIdx;
        currentNodes = null;

        if (matchIdx !== -1) {
            // Check cache first
            if (branchCache[matchIdx]) {
                currentNodes = branchCache[matchIdx];
                const arr = Array.isArray(currentNodes) ? currentNodes : [currentNodes];
                arr.forEach(n => parentEl.insertBefore(n, anchor));
            } else {
                // Create new branch
                const [, getChildren] = branches[matchIdx];
                untrack(() => {
                    const result = getChildren();
                    currentNodes = _insert(parentEl, result, anchor);
                    branchCache[matchIdx] = currentNodes;
                });
            }
        }
    });

    return anchor;
}

// ─── List Rendering (f-for) with LIS-based Keyed Reconciliation ────────────────

export function _hFor(sourceGetter, renderItem, keyFn) {
    const anchor = document.createComment('f-for');
    let keyedMap = new Map();
    let orderedKeys = [];

    effect(() => {
        const list = sourceGetter() ?? [];
        const parent = anchor.parentNode;
        if (!parent) return;

        // Step 1: Compute new keys
        const newKeys = new Array(list.length);
        for (let i = 0; i < list.length; i++) {
            newKeys[i] = keyFn(list[i], i);
        }

        // Step 2: Fast path — identical key arrays (only update signals)
        if (orderedKeys.length === newKeys.length) {
            let identical = true;
            for (let i = 0; i < newKeys.length; i++) {
                if (orderedKeys[i] !== newKeys[i]) { identical = false; break; }
            }
            if (identical) {
                for (let i = 0; i < list.length; i++) {
                    const entry = keyedMap.get(newKeys[i]);
                    if (entry && entry.itemSignal() !== list[i]) {
                        entry.itemSignal(list[i]);
                    }
                }
                return;
            }
        }

        // Step 3: Fast path — swap detection (exactly 2 items swapped)
        if (orderedKeys.length === newKeys.length && newKeys.length >= 2) {
            let diffA = -1, diffB = -1, diffCount = 0;
            for (let i = 0; i < newKeys.length; i++) {
                if (orderedKeys[i] !== newKeys[i]) {
                    if (diffCount === 0) diffA = i;
                    else if (diffCount === 1) diffB = i;
                    diffCount++;
                    if (diffCount > 2) break;
                }
            }
            if (diffCount === 2 && orderedKeys[diffA] === newKeys[diffB] && orderedKeys[diffB] === newKeys[diffA]) {
                const entryA = keyedMap.get(orderedKeys[diffA]);
                const entryB = keyedMap.get(orderedKeys[diffB]);
                const nodeA = _getFirstNode(entryA.node);
                const nodeB = _getFirstNode(entryB.node);
                const refA = nodeA.nextSibling;
                parent.insertBefore(nodeA, nodeB.nextSibling);
                parent.insertBefore(nodeB, refA);
                // Update signals
                if (entryA.itemSignal() !== list[diffA]) entryA.itemSignal(list[diffA]);
                if (entryB.itemSignal() !== list[diffB]) entryB.itemSignal(list[diffB]);
                orderedKeys = newKeys.slice();
                return;
            }
        }

        // Step 4: Full reconciliation
        const newMap = new Map();

        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const key = newKeys[i];
            const exists = keyedMap.get(key);

            if (exists) {
                if (exists.itemSignal() !== item) exists.itemSignal(item);
                newMap.set(key, exists);
            } else {
                const itemSignal = signal(item);
                const node = untrack(() => renderItem(itemSignal, i));
                newMap.set(key, { node, key, itemSignal });
            }
        }

        // Remove nodes that are no longer in the list
        for (const [key, entry] of keyedMap) {
            if (!newMap.has(key) && entry.node) {
                const nodes = Array.isArray(entry.node) ? entry.node : [entry.node];
                nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
            }
        }

        // Reorder using LIS to minimize DOM moves
        if (newKeys.length > 0) {
            _reconcileOrder(parent, anchor, newKeys, newMap, orderedKeys);
        }

        keyedMap = newMap;
        orderedKeys = newKeys.slice();
    });

    return anchor;
}

function _getFirstNode(node) {
    return Array.isArray(node) ? node[0] : node;
}

function _getLastNode(node) {
    return Array.isArray(node) ? node[node.length - 1] : node;
}

/**
 * Reorder DOM nodes using Longest Increasing Subsequence (LIS)
 * to minimize the number of DOM insertBefore operations.
 */
function _reconcileOrder(parent, anchor, newKeys, newMap, oldKeys) {
    // Build index map: oldKey -> old index
    const oldIdxMap = new Map();
    for (let i = 0; i < oldKeys.length; i++) {
        oldIdxMap.set(oldKeys[i], i);
    }

    // Map new keys to old indices (or -1 for new items)
    const oldIndices = new Array(newKeys.length);
    for (let i = 0; i < newKeys.length; i++) {
        const oldIdx = oldIdxMap.get(newKeys[i]);
        oldIndices[i] = oldIdx !== undefined ? oldIdx : -1;
    }

    // Compute LIS of old indices (only for items that existed before)
    const lisIndices = _longestIncreasingSubsequence(oldIndices);
    const lisSet = new Set(lisIndices);

    // Items in the LIS don't need to be moved — everything else does.
    // Insert from right to left, using the next sibling as reference.
    for (let i = newKeys.length - 1; i >= 0; i--) {
        const entry = newMap.get(newKeys[i]);
        const refNode = i === newKeys.length - 1
            ? anchor
            : _getFirstNode(newMap.get(newKeys[i + 1]).node);

        if (!lisSet.has(i) || oldIndices[i] === -1) {
            // This node needs to be inserted/moved
            const targetNodes = Array.isArray(entry.node) ? entry.node : [entry.node];
            targetNodes.forEach(n => parent.insertBefore(n, refNode));
        } else {
            // Node is in LIS — verify position is correct
            const lastTarget = _getLastNode(entry.node);
            if (lastTarget.nextSibling !== refNode) {
                const targetNodes = Array.isArray(entry.node) ? entry.node : [entry.node];
                targetNodes.forEach(n => parent.insertBefore(n, refNode));
            }
        }
    }
}

/**
 * Compute the Longest Increasing Subsequence (LIS).
 * Returns the indices of the LIS elements in the input array.
 * Skips elements with value -1 (new items).
 */
function _longestIncreasingSubsequence(arr) {
    const n = arr.length;
    if (n === 0) return [];

    // tails[i] = smallest tail element for IS of length i+1
    const tails = [];
    // indices[i] = index in arr of tails[i]
    const indices = [];
    // predecessors[i] = predecessor index of arr[i] in the LIS
    const predecessors = new Array(n).fill(-1);
    // posInTails[i] = which position in tails arr[i] occupies
    const posInTails = new Array(n).fill(-1);

    for (let i = 0; i < n; i++) {
        if (arr[i] === -1) continue; // skip new items

        const val = arr[i];

        // Binary search for the position
        let lo = 0, hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (tails[mid] < val) lo = mid + 1;
            else hi = mid;
        }

        tails[lo] = val;
        indices[lo] = i;
        posInTails[i] = lo;

        if (lo > 0) {
            predecessors[i] = indices[lo - 1];
        }
    }

    // Reconstruct the LIS indices
    const result = new Array(tails.length);
    let k = indices[tails.length - 1];
    for (let i = tails.length - 1; i >= 0; i--) {
        result[i] = k;
        k = predecessors[k];
    }

    return result;
}

// ─── Component Creation ────────────────────────────────────────────────────────

export function _createComponent(name, ComponentFn, resolvedProps = {}, options = {}) {
    if (!ComponentFn) {
        console.warn(`[fusée] Component "${name}" is not registered`);
        return document.createComment(`missing:${name}`);
    }

    const container = document.createElement('div');
    container.setAttribute('data-fusee-component', name);

    const api = ComponentFn(resolvedProps, options);

    untrack(() => api.render(container));

    const rootNodes = Array.from(container.childNodes);
    if (rootNodes.length === 0) return document.createComment(`empty:${name}`);

    if (api.unmount) {
        rootNodes[0]._fuseeUnmount = api.unmount;
    }

    return rootNodes.length === 1 ? rootNodes[0] : rootNodes;
}

// ─── Slot Rendering ────────────────────────────────────────────────────────────

export function _hSlot(slots, name, fallbackFn) {
    const anchor = document.createComment(`slot:${name}`);
    const slotFn = slots?.[name];

    effect(() => {
        const nodes = typeof slotFn === 'function' ? slotFn() : fallbackFn();
        _insert(anchor.parentNode, nodes, anchor);
    });

    return anchor;
}

// ─── Mount Entry Point ─────────────────────────────────────────────────────────

export function mount(renderFn, ctx, components, container) {
    let unmountHandler = null;

    const rootNodes = untrack(() => {
        const result = renderFn(ctx, components);
        return Array.isArray(result) ? result : [result];
    });

    rootNodes.forEach(node => {
        if (node) container.appendChild(node);
        if (node && node._fuseeUnmount) unmountHandler = node._fuseeUnmount;
    });

    return {
        unmount() {
            if (unmountHandler) unmountHandler();
            container.innerHTML = '';
        }
    };
}
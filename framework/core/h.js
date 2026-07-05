import { effect, batch, signal, untrack } from '../core/signal.js';
import { createEventHandler, registerDelegatedEvent, isDelegatedEvent } from '../core/event-delegation.js';

export { effect as _effect, batch as _batch };

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

export function _setClass(el, value) {
    const val = typeof value === 'function' ? value() : value;
    if (typeof val === 'string') {
        el.className = val;
    } else if (Array.isArray(val)) {
        el.className = val.filter(Boolean).join(' ');
    } else if (val && typeof val === 'object') {
        el.className = Object.entries(val).filter(([, v]) => !!v).map(([k]) => k).join(' ');
    } else {
        el.className = '';
    }
}

export function _setStyle(el, value) {
    const val = typeof value === 'function' ? value() : value;
    if (val !== null && typeof val === 'object') {
        for (const k in val) el.style[k] = val[k];
    } else {
        el.style.cssText = String(val ?? '');
    }
}

const SENSITIVE_ATTRS = new Set(['href', 'src', 'srcset', 'formaction', 'xlink:href', 'data']);
export function _setAttr(el, name, value) {
    const val = typeof value === 'function' ? value() : value;
    
    if (name in el && typeof el[name] !== 'undefined' && name !== 'type' && name !== 'class' && name !== 'style') {
        try {
            el[name] = val;
            return;
        } catch (_) {}
    }

    if (typeof val === 'boolean') {
        val ? el.setAttribute(name, '') : el.removeAttribute(name);
        return;
    }

    if (val == null) {
        el.removeAttribute(name);
        return;
    }

    let strVal = String(val);
    if (SENSITIVE_ATTRS.has(name.toLowerCase()) && /^(javascript|data|vbscript|file):/i.test(strVal.trim())) {
        console.warn(`[fusée] Blocked potential XSS on "${name}": "${strVal}"`);
        strVal = 'about:blank';
    }

    el.setAttribute(name, strVal);
}

export function _on(el, eventName, handler, modifiers = []) {
    const handlerState = { timeoutId: null, throttleTimeoutId: null, lastRun: 0 };
    const wrappedHandler = createEventHandler(handler, modifiers, null, null, handlerState);

    if (isDelegatedEvent(eventName)) {
        registerDelegatedEvent(el, eventName, wrappedHandler, { modifiers, handlerState });
    } else {
        el.addEventListener(eventName, wrappedHandler);
    }
}

export function _insert(parent, accessor, marker = null, current = null) {
    if (typeof accessor === 'function') {
        effect(() => {
            current = _insert(parent, accessor(), marker, current);
        });
        return current;
    }

    if (accessor == null) accessor = '';

    if (Array.isArray(accessor)) {
        if (current && Array.isArray(current)) {
            current.forEach(node => node && node.parentNode && node.parentNode.removeChild(node));
        } else if (current && current.parentNode) {
            current.parentNode.removeChild(current);
        }
        
        const fragment = document.createDocumentFragment();
        const nodes = accessor.map(a => {
            const n = a instanceof Node ? a : document.createTextNode(String(a));
            fragment.appendChild(n);
            return n;
        });
        parent.insertBefore(fragment, marker);
        return nodes;
    }

    const node = accessor instanceof Node ? accessor : document.createTextNode(String(accessor));

    if (current) {
        if (Array.isArray(current)) {
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

export function _hIf(branches) {
    const anchor = document.createComment('f-if');
    let currentNodes = null;
    let currentBranch = -1;

    effect(() => {
        let matchIdx = -1;
        for (let i = 0; i < branches.length; i++) {
            const [cond] = branches[i];
            if (cond === null || cond()) { matchIdx = i; break; }
        }

        if (matchIdx === currentBranch) return;
        currentBranch = matchIdx;

        if (currentNodes) {
            const arr = Array.isArray(currentNodes) ? currentNodes : [currentNodes];
            arr.forEach(n => n.parentNode && n.parentNode.removeChild(n));
            currentNodes = null;
        }

        if (matchIdx !== -1) {
            const [, getChildren] = branches[matchIdx];
            untrack(() => {
                const result = getChildren();
                currentNodes = _insert(anchor.parentNode, result, anchor);
            });
        }
    });

    return anchor;
}

export function _hFor(sourceGetter, renderItem, keyFn) {
    const anchor = document.createComment('f-for');
    let keyedMap = new Map();
    let oldKeys = [];

    effect(() => {
        const list = sourceGetter() ?? [];
        const parent = anchor.parentNode;
        if (!parent) return;

        const newKeys = new Array(list.length);
        const keyEvaluatorSignal = signal(null);

        for (let i = 0; i < list.length; i++) {
            keyEvaluatorSignal(list[i]);
            newKeys[i] = keyFn(keyEvaluatorSignal, i);
        }

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

        for (const [key, entry] of keyedMap) {
            if (!newMap.has(key) && entry.node) {
                const nodes = Array.isArray(entry.node) ? entry.node : [entry.node];
                nodes.forEach(n => n.parentNode && n.parentNode.removeChild(n));
            }
        }

        const newEntries = newKeys.map(k => newMap.get(k));
        for (let i = newEntries.length - 1; i >= 0; i--) {
            const entry = newEntries[i];
            const refNode = i === newEntries.length - 1 ? anchor : (Array.isArray(newEntries[i + 1].node) ? newEntries[i + 1].node[0] : newEntries[i + 1].node);
            
            const targetNodes = Array.isArray(entry.node) ? entry.node : [entry.node];
            const lastTarget = targetNodes[targetNodes.length - 1];

            if (lastTarget.nextSibling !== refNode || !lastTarget.parentNode) {
                targetNodes.forEach(n => parent.insertBefore(n, refNode));
            }
        }

        keyedMap = newMap;
        oldKeys = newKeys;
    });

    return anchor;
}

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

export function _hSlot(slots, name, fallbackFn) {
    const anchor = document.createComment(`slot:${name}`);
    const slotFn = slots?.[name];
    
    effect(() => {
        const nodes = typeof slotFn === 'function' ? slotFn() : fallbackFn();
        _insert(anchor.parentNode, nodes, anchor);
    });

    return anchor;
}

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
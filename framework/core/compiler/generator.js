import { NodeType } from "./ast.js";
import { ErrorCode } from "./errors-list.js";
import { throwError } from "./errors.js";

const RUNTIME = "fusee/runtime/h.js";

export function generate(ast, options = {}) {
    const gen = new SolidGenerator(ast, options);
    return gen.generate();
}

class SolidGenerator {
    constructor(ast, options) {
        this.ast = ast;
        this.source = options.source ?? "";
        this.runtimePath = options.runtimePath ?? RUNTIME;
        this.templates = [];
        this.imports = new Set();
        this.localScopes = [];
    }

    generate() {
        const rootNodes = this.ast.children || [];
        if (rootNodes.length === 0) {
            return `export function render() { return null; }`;
        }

        const bodyCode = this._genChildrenArray(rootNodes, true);
        const importList = this.imports.size > 0 ? `import { ${[...this.imports].join(", ")} } from '${this.runtimePath}';\n` : "";
        const templatesCode = this.templates.map((html, idx) => 
            `const _tmpl$${idx + 1} = /*#__PURE__*/ _template(\`${html}\`);`
        ).join("\n");

        return `${importList}\n${templatesCode}\n\nexport function render(_ctx, _components) {\n    return ${bodyCode};\n}`;
    }

    _genChildrenArray(children, isRoot = false) {
        if (!children || children.length === 0) return "null";

        const elements = children.map(child => {
            const forDir = child.props?.find?.(p => p.type === NodeType.DIRECTIVE && p.name === "for");
            if (forDir) return this._genForNode(child, forDir);
            return this._compileBlock(child);
        });

        if (elements.length === 1) return elements[0];
        
        return `[\n        ${elements.join(",\n        ")}\n    ]`;
    }

    _compileBlock(node) {
        if (node.type === "If") return this._genIf(node);
        if (node.type === NodeType.COMPONENT) return this._genComponent(node);
        if (node.type === NodeType.SLOT_OUTLET) return this._genSlotOutlet(node);

        if (node.type === NodeType.TEXT) {
            this.imports.add("_createTextNode");
            return `_createTextNode(${JSON.stringify(node.content)})`;
        }

        if (node.type === NodeType.INTERPOLATION) {
            this.imports.add("_createTextNode");
            this.imports.add("_effect");
            const expr = this._wrapExpr(node.expression.content);
            if (node.expression.isStatic) {
                return `_createTextNode(String(${expr}))`;
            }
            return `(() => { const _t = _createTextNode(""); _effect(() => _t.nodeValue = String(${expr} ?? "")); return _t; })()`;
        }

        const ctx = {
            html: "",
            hydrations: [],
            path: []
        };

        this._walkNode(node, ctx, 0);

        this.templates.push(ctx.html);
        const tmplId = this.templates.length;
        this.imports.add("_template");

        if (ctx.hydrations.length === 0) {
            return `_tmpl$${tmplId}.cloneNode(true)`;
        }

        this.imports.add("_walk");
        
        let block = `(() => {\n        const _el$1 = _tmpl$${tmplId}.cloneNode(true);\n`;
        
        ctx.hydrations.forEach(hyd => {
            if (hyd.path.length > 0) {
                block += `        const ${hyd.id} = _walk(_el$1, [${hyd.path.join(", ")}]);\n`;
            } else {
                block += `        const ${hyd.id} = _el$1;\n`;
            }
            hyd.actions.forEach(action => {
                block += `        ${action}\n`;
            });
        });

        block += `        return _el$1;\n    })()`;
        return block;
    }

    _walkNode(node, ctx, childIdx) {
        const isRoot = ctx.path.length === 0;
        const currentPath = [...ctx.path];
        if (!isRoot) currentPath.push(childIdx);

        if (node.type === NodeType.ELEMENT) {
            const elId = `_el$${ctx.hydrations.length + 2}`;
            const hydration = { id: elId, path: currentPath, actions: [] };
            let isDynamic = false;

            ctx.html += `<${node.tag}`;

            for (const prop of node.props || []) {
                if (prop.type === NodeType.ATTRIBUTE) {
                    ctx.html += ` ${prop.name}="${prop.value}"`;
                } else if (prop.type === NodeType.BINDING) {
                    isDynamic = true;
                    const expr = this._wrapExpr(prop.expression.content);
                    if (prop.name === "class") {
                        this.imports.add("_setClass");
                        hydration.actions.push(`_effect(() => _setClass(${elId}, ${expr}));`);
                    } else if (prop.name === "style") {
                        this.imports.add("_setStyle");
                        hydration.actions.push(`_effect(() => _setStyle(${elId}, ${expr}));`);
                    } else if (prop.name === "key") {
                    } else {
                        this.imports.add("_setAttr");
                        hydration.actions.push(`_effect(() => _setAttr(${elId}, "${prop.name}", ${expr}));`);
                    }
                } else if (prop.type === NodeType.EVENT) {
                    isDynamic = true;
                    this.imports.add("_on");
                    const expr = this._genHandlerExpr(prop.expression.content);
                    const mods = JSON.stringify(prop.modifiers);
                    hydration.actions.push(`_on(${elId}, "${prop.name}", ${expr}, ${mods});`);
                } else if (prop.type === NodeType.DIRECTIVE) {
                    isDynamic = true;
                    this._genDirectiveAction(prop, elId, hydration.actions);
                }
            }

            ctx.html += `>`;

            if (isDynamic) {
                ctx.hydrations.push(hydration);
            }

            if (node.children && node.children.length > 0) {
                const savedPath = ctx.path;
                ctx.path = currentPath;
                node.children.forEach((child, i) => {
                    this._walkNode(child, ctx, i);
                });
                ctx.path = savedPath;
            }

            if (!node.selfClosing) {
                ctx.html += `</${node.tag}>`;
            }

        } else if (node.type === NodeType.TEXT) {
            ctx.html += node.content;
            
        } else if (node.type === NodeType.INTERPOLATION) {
            ctx.html += ``;
            const elId = `_el$${ctx.hydrations.length + 2}`;
            const expr = this._wrapExpr(node.expression.content);
            this.imports.add("_insert");
            this.imports.add("_effect");
            
            ctx.hydrations.push({
                id: elId,
                path: currentPath,
                actions: [
                    `_insert(${elId}.parentNode, () => ${expr}, ${elId});`
                ]
            });
        } else {
            ctx.html += ``;
            const elId = `_el$${ctx.hydrations.length + 2}`;
            const blockCode = this._compileBlock(node);
            this.imports.add("_insert");
            ctx.hydrations.push({
                id: elId,
                path: currentPath,
                actions: [
                    `_insert(${elId}.parentNode, () => ${blockCode}, ${elId});`
                ]
            });
        }
    }

    _genDirectiveAction(dir, elId, actions) {
        if (dir.name === 'show') {
            this.imports.add("_effect");
            const expr = this._wrapExpr(dir.expression.content);
            actions.push(`_effect(() => ${elId}.style.display = (${expr}) ? '' : 'none');`);
        } else if (dir.name === 'model') {
            this.imports.add("_effect");
            this.imports.add("_on");
            const expr = dir.expression.content;
            actions.push(`_effect(() => ${elId}.value = String(_ctx.${expr}() ?? ''));`);
            actions.push(`_on(${elId}, "input", ($e) => { _ctx.${expr}($e.target.value) }, []);`);
        } else if (dir.name === 'html') {
            this.imports.add("_effect");
            const expr = this._wrapExpr(dir.expression.content);
            actions.push(`_effect(() => ${elId}.innerHTML = String(${expr} ?? ''));`);
        } else if (dir.name === 'ref') {
            const name = dir.expression.content.trim();
            actions.push(`${elId}.dispatchEvent(new CustomEvent('fusee:ref', { detail: { name: "${name}" }, bubbles: true }));`);
        }
    }

    _genIf(node) {
        this.imports.add("_hIf");
        const branches = node.branches.map(branch => {
            const cond = branch.condition ? this._wrapExpr(branch.condition.content) : "true";
            const children = this._genChildrenArray(branch.node.children ?? []);
            return `[() => ${cond}, () => ${children}]`;
        });
        return `_hIf([\n        ${branches.join(",\n        ")}\n    ])`;
    }

    _genForNode(node, forDir) {
        this.imports.add("_hFor");
        const { item, source, index } = forDir.arg;
        const sourceJs = this._wrapExpr(source);

        this.localScopes.push(new Set([item, index].filter(Boolean)));

        const innerProps = node.props.filter(p => !(p.type === NodeType.DIRECTIVE && p.name === "for"));
        const innerNode = { ...node, props: innerProps };
        const keyBinding = innerProps.find(p => p.type === NodeType.BINDING && p.name === "key");
        const keyExpr = keyBinding ? keyBinding.expression.content : "undefined";
        
        const itemParam = index ? `${item}, ${index}` : item;
        const innerJs = this._compileBlock(innerNode);
        const keyJs = this._wrapExpr(keyExpr);

        this.localScopes.pop();

        return `_hFor(() => ${sourceJs}, (${itemParam}) => ${innerJs}, (${itemParam}) => ${keyJs})`;
    }

    _genComponent(node) {
        this.imports.add("_createComponent");
        const name = JSON.stringify(node.name);
        
        let propsObj = "{";
        let listenersObj = "{";
        
        for (const prop of node.props || []) {
            if (prop.type === NodeType.ATTRIBUTE) {
                propsObj += `"${prop.name}": ${JSON.stringify(prop.value ?? true)}, `;
            } else if (prop.type === NodeType.BINDING) {
                propsObj += `get "${prop.name}"() { return ${this._wrapExpr(prop.expression.content)}; }, `;
            } else if (prop.type === NodeType.EVENT) {
                listenersObj += `"${prop.name}": ${this._genHandlerExpr(prop.expression.content)}, `;
            }
        }
        propsObj += "}";
        listenersObj += "}";

        let slotsObj = "{";
        if (node.slots) {
            for (const [sName, sChildren] of Object.entries(node.slots)) {
                slotsObj += `"${sName}": () => ${this._genChildrenArray(sChildren)}, `;
            }
        }
        slotsObj += "}";

        return `_createComponent(${name}, _components[${name}], ${propsObj}, { listeners: ${listenersObj}, slots: ${slotsObj} })`;
    }

    _genSlotOutlet(node) {
        this.imports.add("_hSlot");
        const name = JSON.stringify(node.slotName);
        const fallback = this._genChildrenArray(node.fallback);
        return `_hSlot(_ctx._slots, ${name}, () => ${fallback})`;
    }

    _genHandlerExpr(expr) {
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr.trim())) {
            return `_ctx.${expr.trim()}`;
        }
        return `($event) => { ${this._wrapExpr(expr)} }`;
    }

    isLocal(id) {
        return this.localScopes.some(scope => scope.has(id));
    }

    _wrapExpr(expr) {
        if (expr.includes("_ctx.")) return expr;
        if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(expr.trim())) {
            const id = expr.trim();
            if (this.isLocal(id)) return id;
            return `(typeof _ctx.${id} === 'function' && _ctx.${id}.isSignal ? _ctx.${id}() : _ctx.${id})`;
        }
        return this._rewriteExpr(expr);
    }

    _rewriteExpr(expr) {
        const GLOBALS = new Set([
            'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
            'Array', 'Object', 'String', 'Number', 'Boolean', 'Date',
            'Math', 'JSON', 'Promise', 'Map', 'Set', 'Symbol',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'console',
            'typeof', 'instanceof', 'void', 'delete', 'new', 'return',
            'if', 'else', 'for', 'while', 'do', 'switch', 'case',
            'break', 'continue', 'function', 'class', 'const', 'let',
            'var', 'import', 'export', 'default', 'this',
        ]);

        return expr.replace(
            /(?<![.\w$])([a-zA-Z_$][a-zA-Z0-9_$]*)(?!\s*:)(?=\s*[\(\.\,\)\]\s+\|\&\!\?\+\-\*\/\%\=\<\>]|$)/g,
            (match, id) => {
                if (GLOBALS.has(id)) return match;
                if (this.isLocal(id)) return match;
                return `_ctx.${id}`;
            }
        );
    }
}
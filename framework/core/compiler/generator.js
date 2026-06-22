import { NodeType } from "./ast.js";
import { ErrorCode } from "./errors-list.js";
import { throwError } from "./errors.js";

export function generate(ast, options = {}) {
    const gen = new Generator(ast, options);
    return gen.generate();
}

const RUNTIME = "fusee/runtime/h.js";

class Generator {
    constructor(ast, options) {
        this.ast = ast;
        this.source = options.source ?? "";
        this.runtimePath = options.runtimePath ?? RUNTIME;
        this.indent = 0;
        this.lines = [];
        this._hoistedIdx = 0;
        this._hoistedMap = new Map();
        this._imports = new Set([
            "h",
            "hText",
            "createComponent",
            "_effect",
            "_batch",
        ]);
    }

    generate() {
        if (this.ast._hoisted) {
            for (const node of this.ast._hoisted) {
                const name = `_s${this._hoistedIdx++}`;
                this._hoistedMap.set(node, name);
            }
        }

        const bodyLines = [];
        const children = this._genChildren(this.ast.children);

        const hoistedDecls = [];
        for (const [node, name] of this._hoistedMap) {
            hoistedDecls.push(`const ${name} = ${this._genNode(node, true)}`);
        }

        const importList = [...this._imports].join(", ");
        const output = [
            `import { ${importList} } from '${this.runtimePath}'`,
            "",
            ...(hoistedDecls.length ? [...hoistedDecls, ""] : []),
            `export function render(_ctx, _components) {`,
            `    return [`,
            ...children.map((l) => `        ${l}`),
            `    ]`,
            `}`,
        ];

        return output.join("\n");
    }

    _genChildren(children) {
        if (!children || children.length === 0) return [];
        return children.flatMap((child) => {
            const forDir = child.props?.find?.(
                (p) => p.type === NodeType.DIRECTIVE && p.name === "for",
            );
            if (forDir) return [this._genForNode(child, forDir)];
            return [this._genNode(child)];
        });
    }

    _genNode(node, inHoist = false) {
        if (!inHoist && this._hoistedMap.has(node)) {
            return this._hoistedMap.get(node);
        }

        switch (node.type) {
            case NodeType.TEXT:
                return this._genText(node);
            case NodeType.INTERPOLATION:
                return this._genInterpolation(node);
            case NodeType.ELEMENT:
                return this._genElement(node);
            case NodeType.COMPONENT:
                return this._genComponent(node);
            case NodeType.SLOT_OUTLET:
                return this._genSlotOutlet(node);
            case "If":
                return this._genIf(node);
            default:
                throwError(
                    ErrorCode.UNKNOWN_NODE_TYPE,
                    node.loc,
                    this.source,
                    node.type,
                );
        }
    }

    _genText(node) {
        return `hText(${JSON.stringify(node.content)})`;
    }

    _genInterpolation(node) {
        this._imports.add("_effect");
        const expr = node.expression.content;
        if (node.expression.isStatic) {
            return `hText(String(${expr}))`;
        }
        return `hText(() => String(${this._wrapExpr(expr)}))`;
    }

    _genElement(node) {
        const tag = JSON.stringify(node.tag);
        const props = this._genProps(node.props);
        const children = this._genChildrenArray(node.children);
        const args = [tag, props, children];

        if (node.isStatic) args.push("true");

        return `h(${args.join(", ")})`;
    }

    _genComponent(node) {
        this._imports.add("createComponent");

        const name = JSON.stringify(node.name);
        const props = this._genComponentProps(node.props);
        const slots = this._genSlots(node.slots);
        return `createComponent(${name}, _components[${name}], ${props}, ${slots})`;
    }

    _genSlotOutlet(node) {
        this._imports.add("hSlot");
        const name = JSON.stringify(node.slotName);
        const fallback = this._genChildrenArray(node.fallback);
        return `hSlot(_ctx._slots, ${name}, ${fallback})`;
    }

    _genIf(node) {
        this._imports.add("hIf");

        const branches = node.branches.map((branch) => {
            const cond = branch.condition
                ? this._wrapExpr(branch.condition.content)
                : "true";
            const children = this._genChildrenArray(branch.node.children ?? []);
            return `[() => ${cond}, () => ${children}]`;
        });

        return `hIf([\n        ${branches.join(",\n        ")}\n    ])`;
    }

    _genProps(props) {
        if (!props || props.length === 0) return "{}";

        const entries = [];

        for (const prop of props) {
            switch (prop.type) {
                case NodeType.ATTRIBUTE:
                    entries.push(this._genAttrEntry(prop));
                    break;
                case NodeType.BINDING:
                    entries.push(this._genBindingEntry(prop));
                    break;
                case NodeType.EVENT:
                    entries.push(this._genEventEntry(prop));
                    break;
                case NodeType.DIRECTIVE:
                    this._genDirectiveEntries(prop, entries);
                    break;
            }
        }

        return `{\n        ${entries.join(",\n        ")}\n    }`;
    }

    _genAttrEntry(prop) {
        return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value ?? true)}`;
    }

    _genBindingEntry(prop) {
        const expr = this._wrapExpr(prop.expression.content);
        if (prop.isProp) {
            return `${JSON.stringify("prop:" + prop.name)}: () => ${expr}`;
        }
        return `${JSON.stringify(prop.name)}: () => ${expr}`;
    }

    _genEventEntry(prop) {
        const key = JSON.stringify("@" + prop.name);
        const expr = prop.expression.content;
        const mods = JSON.stringify(prop.modifiers);
        const handlerJs = this._genHandlerExpr(expr);
        return `${key}: { handler: ${handlerJs}, modifiers: ${mods} }`;
    }

    _genHandlerExpr(expr) {
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr.trim())) {
            return `_ctx.${expr.trim()}`;
        }
        return `($event) => { ${expr} }`;
    }

    _genDirectiveEntries(dir, entries) {
        switch (dir.name) {
            case "if":
            case "else-if":
            case "else":
                break;
            case "for":
                break;
            case "show": {
                const expr = this._wrapExpr(dir.expression.content);
                entries.push(`'f-show': () => ${expr}`);
                break;
            }

            case "model": {
                const expr = dir.expression.content;
                entries.push(`'f-model': () => _ctx.${expr}`);
                entries.push(
                    `'@input': { handler: ($e) => { _ctx.${expr}($e.target.value) }, modifiers: [] }`,
                );
                break;
            }

            case "html": {
                const expr = this._wrapExpr(dir.expression.content);
                entries.push(`'f-html': () => ${expr}`);
                break;
            }

            case "ref": {
                const name = dir.expression.content.trim();
                entries.push(`'f-ref': ${JSON.stringify(name)}`);
                break;
            }

            case "once":
                entries.push(`'f-once': true`);
                break;

            default:
                entries.push(
                    `${JSON.stringify("f-" + dir.name)}: ${dir.expression ? `() => ${this._wrapExpr(dir.expression.content)}` : "true"}`,
                );
        }
    }

    _genComponentProps(props) {
        if (!props || props.length === 0) return "{}";

        const entries = [];

        for (const prop of props) {
            if (prop.type === NodeType.ATTRIBUTE) {
                entries.push(
                    `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value ?? true)}`,
                );
            } else if (prop.type === NodeType.BINDING) {
                entries.push(
                    `${JSON.stringify(prop.name)}: () => ${this._wrapExpr(prop.expression.content)}`,
                );
            } else if (prop.type === NodeType.EVENT) {
                const handlerJs = this._genHandlerExpr(prop.expression.content);
                entries.push(`${JSON.stringify("on:" + prop.name)}: ${handlerJs}`);
            }
        }

        return `{ ${entries.join(", ")} }`;
    }

    _genSlots(slots) {
        if (!slots || Object.keys(slots).length === 0) return "{}";

        const entries = Object.entries(slots).map(([name, children]) => {
            const childrenJs = this._genChildrenArray(children);
            return `${JSON.stringify(name)}: () => ${childrenJs}`;
        });

        return `{ ${entries.join(", ")} }`;
    }

    _genChildrenArray(children) {
        if (!children || children.length === 0) return "[]";
        const expanded = children.flatMap((child) => {
            const forDir = child.props?.find?.(
                (p) => p.type === NodeType.DIRECTIVE && p.name === "for",
            );
            if (forDir) return [this._genForNode(child, forDir)];
            return [this._genNode(child)];
        });

        if (expanded.length === 1) return `[${expanded[0]}]`;
        return `[\n        ${expanded.join(",\n        ")}\n    ]`;
    }

    _genForNode(node, forDir) {
        this._imports.add("hFor");

        const { item, source, index } = forDir.arg;
        const innerProps = node.props.filter(
            (p) => !(p.type === NodeType.DIRECTIVE && p.name === "for"),
        );
        const innerNode = { ...node, props: innerProps };
        const keyBinding = innerProps.find(
            (p) => p.type === NodeType.BINDING && p.name === "key",
        );
        const keyExpr = keyBinding ? keyBinding.expression.content : "undefined";
        const itemParam = index ? `${item}, ${index}` : item;
        const itemParamStr = `(${itemParam})`;
        const innerJs = this._genNode(innerNode);

        return `hFor(\n        () => ${this._wrapExpr(source)},\n        ${itemParamStr} => ${innerJs},\n        ${itemParamStr} => ${this._wrapExpr(keyExpr)}\n    )`;
    }

    _wrapExpr(expr) {
        if (expr.includes("_ctx.")) return expr;
        if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(expr.trim())) {
            const id = expr.trim();
            return `(typeof _ctx.${id} === 'function' && _ctx.${id}.isSignal ? _ctx.${id}() : _ctx.${id})`;
        }

        return `((_c) => ${expr})(_ctx)`;
    }
}
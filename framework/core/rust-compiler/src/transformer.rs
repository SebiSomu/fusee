use crate::args;
use crate::ast::*;
use crate::errors::{CompileWarning, ErrorCode};
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

pub struct TransformOptions {
    pub components: HashSet<String>,
    pub source: String,
    pub scope: HashSet<String>,
}

pub struct TransformCtx {
    pub components: HashSet<String>,
    pub source: String,
    pub hoisted: Vec<NodeId>,
    pub warnings: Vec<CompileWarning>,
    pub scope: HashSet<String>,
}

pub fn transform(mut ast: Node, options: TransformOptions) -> (Node, Vec<CompileWarning>) {
    let mut ctx = TransformCtx {
        components: options.components,
        source: options.source,
        hoisted: Vec::new(),
        warnings: Vec::new(),
        scope: options.scope,
    };

    mark_static_pass(&mut ast, &mut ctx);
    walk_and_chain(&mut ast, &mut ctx);

    walk_all(&ast, &mut ctx, &mut |n, c| {
        validate_for(n, c);
        validate_model(n, c);
        validate_components(n, c);
    });

    if !ctx.scope.is_empty() {
        let scope = ctx.scope.clone();
        analyse_scope(&ast, &mut ctx, &scope);
    }

    if let Node::Root(r) = &mut ast {
        r.hoisted = ctx.hoisted.clone();
    }

    (ast, ctx.warnings)
}

fn mark_static_pass(node: &mut Node, ctx: &mut TransformCtx) -> bool {
    match node {
        Node::Text(t) => {
            t.is_static = true;
            true
        }

        Node::Interpolation(i) => {
            let is_static = is_literal_expression(&i.expression.content);
            i.expression.is_static = is_static;
            i.is_static = is_static;
            is_static
        }

        Node::Element(e) => {
            let has_once = e
                .props
                .iter()
                .any(|p| matches!(p, Prop::Directive(d) if d.name == "once"));
            if has_once {
                e.is_static = true;
                e.hoisted = true;
                ctx.hoisted.push(e.id);
                return true;
            }

            let has_dynamic = e.props.iter().any(|p| {
                matches!(p, Prop::Directive(_) | Prop::Binding(_) | Prop::Event(_))
            });

            if has_dynamic {
                e.is_static = false;
                for c in e.children.iter_mut() {
                    mark_static_pass(c, ctx);
                }
                return false;
            }

            let has_interpolated_attr = e.props.iter().any(|p| {
                matches!(p, Prop::Attribute(a) if a.value.as_deref().map(|v| v.contains("{{")).unwrap_or(false))
            });
            if has_interpolated_attr {
                e.is_static = false;
                for c in e.children.iter_mut() {
                    mark_static_pass(c, ctx);
                }
                return false;
            }

            let mut children_static = true;
            for c in e.children.iter_mut() {
                if !mark_static_pass(c, ctx) {
                    children_static = false;
                    break;
                }
            }

            e.is_static = children_static;
            if e.is_static && e.children.len() >= 2 {
                e.hoisted = true;
                ctx.hoisted.push(e.id);
            }
            e.is_static
        }

        Node::Component(c) => {
            for (_, slot_children) in c.slots.iter_mut() {
                for child in slot_children.iter_mut() {
                    mark_static_pass(child, ctx);
                }
            }
            false
        }

        Node::Root(r) => {
            for c in r.children.iter_mut() {
                mark_static_pass(c, ctx);
            }
            false
        }

        _ => false,
    }
}

fn walk_and_chain(node: &mut Node, ctx: &mut TransformCtx) {
    match node {
        Node::Root(r) => {
            chain_conditionals_in_children(&mut r.children, ctx);
            for c in r.children.iter_mut() {
                walk_and_chain(c, ctx);
            }
        }
        Node::Element(e) => {
            chain_conditionals_in_children(&mut e.children, ctx);
            for c in e.children.iter_mut() {
                walk_and_chain(c, ctx);
            }
        }
        Node::Component(c) => {
            for (_, children) in c.slots.iter_mut() {
                for child in children.iter_mut() {
                    walk_and_chain(child, ctx);
                }
            }
        }
        Node::If(i) => {
            for b in i.branches.iter_mut() {
                walk_and_chain(&mut b.node, ctx);
            }
        }
        _ => {}
    }
}

fn chain_conditionals_in_children(children: &mut Vec<Node>, ctx: &mut TransformCtx) {
    let mut i = 0;
    while i < children.len() {
        if !children[i].is_element_or_component() {
            i += 1;
            continue;
        }

        let if_dir = children[i].find_directive("if").cloned();
        if if_dir.is_none() {
            let else_dir = children[i]
                .find_directive("else")
                .or_else(|| children[i].find_directive("else-if"))
                .cloned();
            if let Some(d) = else_dir {
                ctx.warnings.push(CompileWarning::new(
                    ErrorCode::VElseNoIf,
                    d.loc.clone(),
                    &ctx.source,
                    args!(),
                ));
            }
            i += 1;
            continue;
        }
        let if_dir = if_dir.unwrap();

        let mut branches = vec![Branch {
            condition: if_dir.expression.clone(),
            node: Box::new(children[i].clone()),
        }];
        let mut j = i + 1;

        while j < children.len() {
            if !children[j].is_element_or_component() {
                j += 1;
                continue;
            }

            let else_if_dir = children[j].find_directive("else-if").cloned();
            let else_dir = children[j].find_directive("else").cloned();

            if let Some(d) = else_if_dir {
                branches.push(Branch {
                    condition: d.expression.clone(),
                    node: Box::new(children[j].clone()),
                });
                j += 1;
            } else if else_dir.is_some() {
                branches.push(Branch {
                    condition: None,
                    node: Box::new(children[j].clone()),
                });
                j += 1;
                break;
            } else {
                break;
            }
        }

        let loc = children[i].loc().clone();
        let if_node = Node::If(IfNode { branches, loc });

        children.splice(i..j, std::iter::once(if_node));
        i += 1;
    }
}

fn validate_for(node: &Node, ctx: &mut TransformCtx) {
    if !node.is_element_or_component() {
        return;
    }
    let for_dir = match node.find_directive("for") {
        Some(d) => d,
        None => return,
    };

    let has_key = node
        .props()
        .map(|props| {
            props
                .iter()
                .any(|p| matches!(p, Prop::Binding(b) if b.name == "key"))
        })
        .unwrap_or(false);

    if !has_key {
        ctx.warnings.push(CompileWarning::new(
            ErrorCode::ForMissingKey,
            for_dir.loc.clone(),
            &ctx.source,
            args!(node.tag_or_name().to_string()),
        ));
    }
}

fn validate_model(node: &Node, ctx: &mut TransformCtx) {
    let el = match node {
        Node::Element(e) => e,
        _ => return,
    };
    let model_dir = match node.find_directive("model") {
        Some(d) => d,
        None => return,
    };
    let allowed = ["input", "textarea", "select"];
    if !allowed.contains(&el.tag.to_lowercase().as_str()) {
        ctx.warnings.push(CompileWarning::new(
            ErrorCode::ModelOnNonInput,
            model_dir.loc.clone(),
            &ctx.source,
            args!(el.tag.clone()),
        ));
    }
}

fn validate_components(node: &Node, ctx: &mut TransformCtx) {
    let comp = match node {
        Node::Component(c) => c,
        _ => return,
    };
    if !ctx.components.contains(&comp.name) {
        ctx.warnings.push(CompileWarning::new(
            ErrorCode::ComponentNotRegistered,
            comp.loc.clone(),
            &ctx.source,
            args!(comp.name.clone()),
        ));
    }
}

fn analyse_scope(node: &Node, ctx: &mut TransformCtx, local_scope: &HashSet<String>) {
    match node {
        Node::Root(r) => {
            for child in &r.children {
                analyse_scope(child, ctx, local_scope);
            }
        }

        Node::Element(e) => {
            let for_dir = node.find_directive("for");
            let child_scope = match for_dir {
                Some(d) => extend_scope_from_for(local_scope, d.arg.as_ref()),
                None => local_scope.clone(),
            };

            for prop in &e.props {
                validate_prop(prop, ctx, &child_scope);
            }
            for child in &e.children {
                analyse_scope(child, ctx, &child_scope);
            }
        }

        Node::Component(c) => {
            let for_dir = node.find_directive("for");
            let child_scope = match for_dir {
                Some(d) => extend_scope_from_for(local_scope, d.arg.as_ref()),
                None => local_scope.clone(),
            };

            for prop in &c.props {
                validate_prop(prop, ctx, &child_scope);
            }
            for (_, slot_children) in &c.slots {
                for child in slot_children {
                    analyse_scope(child, ctx, &child_scope);
                }
            }
        }

        Node::Interpolation(i) => {
            validate_expression(&i.expression, ctx, local_scope, false);
        }

        Node::If(ifn) => {
            for branch in &ifn.branches {
                if let Some(cond) = &branch.condition {
                    validate_expression(cond, ctx, local_scope, false);
                }
                analyse_scope(&branch.node, ctx, local_scope);
            }
        }

        Node::Text(_) | Node::SlotOutlet(_) | Node::SlotContent(_) => {}
    }
}

fn validate_prop(prop: &Prop, ctx: &mut TransformCtx, scope: &HashSet<String>) {
    match prop {
        Prop::Binding(b) => validate_expression(&b.expression, ctx, scope, false),
        Prop::Event(e) => validate_expression(&e.expression, ctx, scope, true),
        Prop::Directive(d) => {
            if d.name == "for" {
                return;
            }
            if let Some(expr) = &d.expression {
                validate_expression(expr, ctx, scope, false);
            }
        }
        Prop::Attribute(_) => {}
    }
}

fn validate_expression(expr_node: &Expression, ctx: &mut TransformCtx, scope: &HashSet<String>, is_handler: bool) {
    if expr_node.is_static {
        return;
    }

    let raw = expr_node.content.trim();
    if raw.is_empty() {
        return;
    }

    let identifiers = extract_identifiers(raw);

    for id in &identifiers {
        if JS_GLOBALS.contains(id.as_str()) {
            continue;
        }
        if is_handler && id == "$event" {
            continue;
        }
        if !scope.contains(id) {
            ctx.warnings.push(CompileWarning::new(
                ErrorCode::UnknownIdentifier,
                expr_node.loc.clone(),
                &ctx.source,
                args!(id.clone(), raw.to_string()),
            ));
        }
    }

    if expr_node.is_for_key && is_literal_expression(raw) {
        ctx.warnings.push(CompileWarning::new(
            ErrorCode::StaticForKey,
            expr_node.loc.clone(),
            &ctx.source,
            args!(raw.to_string()),
        ));
    }
}

fn strip_string_literals(expr: &str) -> String {
    static SINGLE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"'[^'\\]*(?:\\.[^'\\]*)*'"#).unwrap());
    static DOUBLE: Lazy<Regex> = Lazy::new(|| Regex::new(r#""[^"\\]*(?:\\.[^"\\]*)*""#).unwrap());
    static BACKTICK: Lazy<Regex> = Lazy::new(|| Regex::new(r#"`[^`\\]*(?:\\.[^`\\]*)*`"#).unwrap());

    let s = SINGLE.replace_all(expr, "\"\"");
    let s = DOUBLE.replace_all(&s, "\"\"");
    let s = BACKTICK.replace_all(&s, "\"\"");
    s.into_owned()
}

fn extract_identifiers(expr: &str) -> HashSet<String> {
    let stripped = strip_string_literals(expr);
    let chars: Vec<char> = stripped.chars().collect();
    let mut found = HashSet::new();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c.is_ascii_alphabetic() || c == '_' || c == '$' {
            let start = i;
            let mut j = i;
            while j < chars.len()
                && (chars[j].is_ascii_alphanumeric() || chars[j] == '_' || chars[j] == '$')
            {
                j += 1;
            }
            let id: String = chars[start..j].iter().collect();

            let preceded_by_word = start > 0
                && (chars[start - 1].is_ascii_alphanumeric()
                || chars[start - 1] == '_'
                || chars[start - 1] == '$');
            let preceded_by_dot = start > 0 && chars[start - 1] == '.';

            if !JS_KEYWORDS.contains(id.as_str()) && !preceded_by_word && !preceded_by_dot {
                found.insert(id);
            }
            i = j;
        } else {
            i += 1;
        }
    }

    found
}

fn extend_scope_from_for(parent: &HashSet<String>, for_arg: Option<&ForArg>) -> HashSet<String> {
    let for_arg = match for_arg {
        Some(a) => a,
        None => return parent.clone(),
    };
    let mut extended = parent.clone();
    if !for_arg.item.is_empty() {
        extended.insert(for_arg.item.clone());
    }
    if let Some(idx) = &for_arg.index {
        extended.insert(idx.clone());
    }
    extended
}

static JS_GLOBALS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "Math", "Object", "Array", "String", "Number", "Boolean", "Symbol", "Date", "RegExp",
        "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "Promise", "Proxy", "Reflect", "JSON",
        "Error", "TypeError", "RangeError", "parseInt", "parseFloat", "isNaN", "isFinite",
        "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "console",
        "window", "document", "globalThis", "undefined", "null", "Infinity", "NaN", "setTimeout",
        "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "fetch", "true", "false",
    ]
        .into_iter()
        .collect()
});

static JS_KEYWORDS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "return",
        "throw", "try", "catch", "finally", "new", "delete", "typeof", "instanceof", "in", "of",
        "void", "const", "let", "var", "function", "class", "import", "export", "default",
        "extends", "super", "this", "yield", "await", "async", "true", "false", "null",
        "undefined",
    ]
        .into_iter()
        .collect()
});

static LITERAL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"^(?:true|false|null|undefined|-?\d[\d._]*(?:n)?|'[^']*'|"[^"]*"|`[^`]*`)$"#)
        .unwrap()
});

fn is_literal_expression(expr: &str) -> bool {
    LITERAL_RE.is_match(expr.trim())
}

fn walk_all<F: FnMut(&Node, &mut TransformCtx)>(node: &Node, ctx: &mut TransformCtx, visitor: &mut F) {
    visitor(node, ctx);
    match node {
        Node::Root(r) => {
            for c in &r.children {
                walk_all(c, ctx, visitor);
            }
        }
        Node::Element(e) => {
            for c in &e.children {
                walk_all(c, ctx, visitor);
            }
        }
        Node::If(i) => {
            for b in &i.branches {
                walk_all(&b.node, ctx, visitor);
            }
        }
        Node::Component(c) => {
            for (_, children) in &c.slots {
                for child in children {
                    walk_all(child, ctx, visitor);
                }
            }
        }
        _ => {}
    }
}
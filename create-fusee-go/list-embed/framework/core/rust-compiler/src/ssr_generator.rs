use crate::ast::*;
use crate::errors::{CompileError, ErrorCode};
use once_cell::sync::Lazy;
use std::collections::{HashMap, HashSet};

const DEFAULT_SSR_RUNTIME: &str = "fusee/runtime/ssr.js";
const VOID_ELEMENTS: &[&str] = &["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

pub struct SSRGenerateOptions {
    pub source: String,
    pub runtime_path: Option<String>,
}

pub fn generate_ssr(root: &RootNode, options: SSRGenerateOptions) -> Result<String, CompileError> {
    let mut gen = SSRGenerator::new(&options.source, options.runtime_path.as_deref());
    gen.generate(root)
}

struct OrderedSet {
    items: Vec<String>,
    seen: HashSet<String>,
}

impl OrderedSet {
    fn new(initial: &[&str]) -> Self {
        let mut s = OrderedSet {
            items: Vec::new(),
            seen: HashSet::new(),
        };
        for i in initial {
            s.add(i);
        }
        s
    }

    fn add(&mut self, s: &str) {
        if self.seen.insert(s.to_string()) {
            self.items.push(s.to_string());
        }
    }

    fn join(&self, sep: &str) -> String {
        self.items.join(sep)
    }
}

struct SSRGenerator<'a> {
    source: &'a str,
    runtime_path: String,
    imports: OrderedSet,
    local_scopes: Vec<HashSet<String>>,
    anchor_idx: usize,
    hoisted_lookup: HashMap<NodeId, String>,
    hoisted_order: Vec<(NodeId, String)>,
}

impl<'a> SSRGenerator<'a> {
    fn new(source: &'a str, runtime_path: Option<&str>) -> Self {
        SSRGenerator {
            source,
            runtime_path: runtime_path.unwrap_or(DEFAULT_SSR_RUNTIME).to_string(),
            imports: OrderedSet::new(&[
                "escapeHtml",
                "escapeAttr",
                "renderClass",
                "renderStyle",
                "ssrEnumerate",
                "renderComponentSSR",
                "ssrVal",
            ]),
            local_scopes: Vec::new(),
            anchor_idx: 0,
            hoisted_lookup: HashMap::new(),
            hoisted_order: Vec::new(),
        }
    }

    fn next_anchor(&mut self) -> usize {
        let idx = self.anchor_idx;
        self.anchor_idx += 1;
        idx
    }

    fn generate(&mut self, root: &RootNode) -> Result<String, CompileError> {
        let mut id_to_node: HashMap<NodeId, &ElementNode> = HashMap::new();
        for c in &root.children {
            collect_element_refs(c, &mut id_to_node);
        }

        for (idx, nid) in root.hoisted.iter().enumerate() {
            let name = format!("_ss{}", idx);
            self.hoisted_lookup.insert(*nid, name.clone());
            self.hoisted_order.push((*nid, name));
        }

        let mut body: Vec<String> = vec!["let __html = ''".to_string()];
        self.emit_children(&root.children, &mut body, "__html")?;
        body.push("return __html".to_string());

        let hoisted_order = self.hoisted_order.clone();
        let mut hoisted_decls = Vec::new();
        for (nid, name) in &hoisted_order {
            if let Some(&node) = id_to_node.get(nid) {
                let mut stmts: Vec<String> = vec!["let __h = ''".to_string()];
                self.emit_element(node, &mut stmts, "__h", true)?;
                stmts.push("return __h".to_string());
                let inner = stmts
                    .iter()
                    .map(|l| format!("    {}", l))
                    .collect::<Vec<_>>()
                    .join("\n");
                hoisted_decls.push(format!("const {} = (() => {{\n{}\n}})()", name, inner));
            }
        }

        let import_list = self.imports.join(", ");
        let mut output: Vec<String> = vec![
            format!("import {{ {} }} from '{}'", import_list, self.runtime_path),
            String::new(),
        ];
        if !hoisted_decls.is_empty() {
            output.extend(hoisted_decls);
            output.push(String::new());
        }
        output.push("export async function renderSSR(_ctx, _components) {".to_string());
        for line in &body {
            output.push(format!("    {}", line));
        }
        output.push("}".to_string());

        Ok(output.join("\n"))
    }

    fn emit_children(&mut self, children: &[Node], out: &mut Vec<String>, var_name: &str) -> Result<(), CompileError> {
        for child in children {
            if let Some(for_dir) = find_for_dir(child) {
                self.emit_for_node(child, for_dir, out, var_name)?;
            } else {
                self.emit_node(child, out, var_name, false)?;
            }
        }
        Ok(())
    }

    fn emit_node(&mut self, node: &Node, out: &mut Vec<String>, var_name: &str, in_hoist: bool) -> Result<(), CompileError> {
        if !in_hoist {
            if let Node::Element(e) = node {
                if let Some(name) = self.hoisted_lookup.get(&e.id) {
                    out.push(format!("{} += {}", var_name, name));
                    return Ok(());
                }
            }
        }

        match node {
            Node::Text(t) => Ok(self.emit_text(t, out, var_name)),
            Node::Interpolation(i) => Ok(self.emit_interpolation(i, out, var_name)),
            Node::Element(e) => self.emit_element(e, out, var_name, in_hoist),
            Node::Component(c) => self.emit_component(c, out, var_name),
            Node::SlotOutlet(s) => Ok(self.emit_slot_outlet(s, out, var_name)),
            Node::If(i) => self.emit_if(i, out, var_name),
            other => Err(CompileError::new(
                ErrorCode::UnknownNodeType,
                other.loc().clone(),
                self.source,
                &[node_type_name(other).to_string()],
            )),
        }
    }

    fn emit_text(&mut self, node: &TextNode, out: &mut Vec<String>, var_name: &str) {
        out.push(format!("{} += {}", var_name, json_string(&node.content)));
    }

    fn emit_interpolation(&mut self, node: &InterpolationNode, out: &mut Vec<String>, var_name: &str) {
        let expr = &node.expression.content;
        if node.expression.is_static {
            out.push(format!("{} += escapeHtml(String({}))", var_name, expr));
            return;
        }
        let id = self.next_anchor();
        let wrapped = self.wrap_expr(expr);
        out.push(format!(
            "{} += '<!--f-bind:{}-->' + escapeHtml(String({})) + '<!--/f-bind:{}-->'",
            var_name, id, wrapped, id
        ));
    }

    fn emit_element(&mut self, node: &ElementNode, out: &mut Vec<String>, var_name: &str, _in_hoist: bool) -> Result<(), CompileError> {
        let tag = &node.tag;
        let is_void = node.self_closing || VOID_ELEMENTS.contains(&tag.to_lowercase().as_str());

        let html_dir = node
            .props
            .iter()
            .find_map(|p| p.as_directive().filter(|d| d.name == "html"));

        let needs_anchor = node.props.iter().any(|p| match p {
            Prop::Binding(_) => true,
            Prop::Event(_) => true,
            Prop::Directive(d) => !["if", "else-if", "else", "for"].contains(&d.name.as_str()),
            Prop::Attribute(_) => false,
        });
        let anchor_id = if needs_anchor { Some(self.next_anchor()) } else { None };

        out.push(format!("{} += '<{}'", var_name, tag));
        self.emit_attrs(&node.props, out, var_name)?;
        if let Some(aid) = anchor_id {
            out.push(format!("{} += ' data-f-id=\"{}\"'", var_name, aid));
        }
        out.push(format!(
            "{} += '{}'",
            var_name,
            if is_void { "/>" } else { ">" }
        ));
        if is_void {
            return Ok(());
        }

        if let Some(dir) = html_dir {
            let expr = self.wrap_expr(&dir.expression.as_ref().unwrap().content);
            out.push(format!("{} += String({})", var_name, expr));
        } else {
            self.emit_children(&node.children, out, var_name)?;
        }
        out.push(format!("{} += '</{}>'", var_name, tag));
        Ok(())
    }

    fn emit_attrs(&mut self, props: &[Prop], out: &mut Vec<String>, var_name: &str) -> Result<(), CompileError> {
        for prop in props {
            match prop {
                Prop::Attribute(a) => self.emit_static_attr(a, out, var_name),
                Prop::Binding(b) => self.emit_binding_attr(b, out, var_name)?,
                Prop::Directive(d) => self.emit_directive_attr(d, out, var_name)?,
                Prop::Event(_) => {}
            }
        }
        Ok(())
    }

    fn emit_static_attr(&mut self, prop: &AttributeNode, out: &mut Vec<String>, var_name: &str) {
        match &prop.value {
            None => {
                out.push(format!("{} += ' {}'", var_name, prop.name));
            }
            Some(v) => {
                out.push(format!(
                    "{} += ' {}=\"' + escapeAttr({}) + '\"'",
                    var_name,
                    prop.name,
                    json_string(v)
                ));
            }
        }
    }

    fn emit_binding_attr(&mut self, prop: &BindingNode, out: &mut Vec<String>, var_name: &str) -> Result<(), CompileError> {
        let expr = self.wrap_expr(&prop.expression.content);
        if prop.is_prop {
            return Ok(());
        }
        if prop.name == "class" {
            out.push(format!(
                "{} += ' class=\"' + escapeAttr(renderClass({})) + '\"'",
                var_name, expr
            ));
        } else if prop.name == "style" {
            out.push(format!(
                "{} += ' style=\"' + escapeAttr(renderStyle({})) + '\"'",
                var_name, expr
            ));
        } else {
            out.push(format!(
                "{} += (function(v){{ if (v === false || v == null) return ''; if (v === true) return ' {}'; return ' {}=\"' + escapeAttr(String(v)) + '\"' }})({})",
                var_name, prop.name, prop.name, expr
            ));
        }
        Ok(())
    }

    fn emit_directive_attr(&mut self, dir: &DirectiveNode, out: &mut Vec<String>, var_name: &str) -> Result<(), CompileError> {
        match dir.name.as_str() {
            "show" => {
                let expr = self.wrap_expr(&dir.expression.as_ref().unwrap().content);
                out.push(format!(
                    "{} += ({}) ? '' : ' style=\"display:none\"'",
                    var_name, expr
                ));
            }
            "model" => {
                let expr = self.wrap_expr(&dir.expression.as_ref().unwrap().content);
                out.push(format!(
                    "{} += ' value=\"' + escapeAttr(String({} ?? '')) + '\"'",
                    var_name, expr
                ));
            }
            _ => {}
        }
        Ok(())
    }

    fn emit_if(&mut self, node: &IfNode, out: &mut Vec<String>, var_name: &str) -> Result<(), CompileError> {
        let id = self.next_anchor();
        out.push(format!("{} += '<!--f-if:{}-->'", var_name, id));

        let mut first = true;
        for branch in &node.branches {
            let mut block_stmts: Vec<String> = Vec::new();
            self.emit_node(&branch.node, &mut block_stmts, var_name, false)?;
            let indented = block_stmts
                .iter()
                .map(|s| format!("    {}", s))
                .collect::<Vec<_>>()
                .join("\n");

            match &branch.condition {
                Some(cond) => {
                    let cond_js = self.wrap_expr(&cond.content);
                    if first {
                        out.push(format!("if ({}) {{\n{}\n}}", cond_js, indented));
                    } else {
                        out.push(format!("else if ({}) {{\n{}\n}}", cond_js, indented));
                    }
                }
                None => {
                    out.push(format!("else {{\n{}\n}}", indented));
                }
            }
            first = false;
        }

        out.push(format!("{} += '<!--/f-if:{}-->'", var_name, id));
        Ok(())
    }

    fn emit_for_node(&mut self, node: &Node, for_dir: &DirectiveNode, out: &mut Vec<String>, var_name: &str) -> Result<(), CompileError> {
        let id = self.next_anchor();
        let for_arg = for_dir.arg.as_ref().expect("f-for must have parsed arg");
        let item = for_arg.item.clone();
        let index = for_arg.index.clone();
        let source_expr = self.wrap_expr(&for_arg.source);

        let mut scope = HashSet::new();
        scope.insert(item.clone());
        if let Some(idx) = &index {
            scope.insert(idx.clone());
        }
        self.local_scopes.push(scope);

        let props = node.props().cloned().unwrap_or_default();
        let inner_props: Vec<Prop> = props
            .into_iter()
            .filter(|p| !matches!(p, Prop::Directive(d) if d.name == "for"))
            .collect();

        let key_binding = inner_props
            .iter()
            .find_map(|p| p.as_binding().filter(|b| b.name == "key"));
        let key_expr = key_binding
            .map(|b| b.expression.content.clone())
            .unwrap_or_else(|| "undefined".to_string());

        let inner_node = with_props(node.clone(), inner_props);
        let item_param = match &index {
            Some(idx) => format!("{}, {}", item, idx),
            None => item.clone(),
        };

        let key_wrapped = self.wrap_expr(&key_expr);
        let mut inner_stmts: Vec<String> = Vec::new();
        self.emit_node(&inner_node, &mut inner_stmts, var_name, false)?;

        self.local_scopes.pop();

        out.push(format!("{} += '<!--f-for:{}-->'", var_name, id));
        out.push(format!(
            "for (const [{}] of ssrEnumerate({})) {{",
            item_param, source_expr
        ));
        out.push(format!("    const __key{} = {}", id, key_wrapped));
        out.push(format!(
            "    {} += '<!--f-for-item:{}:' + escapeAttr(String(__key{})) + '-->'",
            var_name, id, id
        ));
        for s in &inner_stmts {
            out.push(format!("    {}", s));
        }
        out.push(format!(
            "    {} += '<!--/f-for-item:{}-->'",
            var_name, id
        ));
        out.push("}".to_string());
        out.push(format!("{} += '<!--/f-for:{}-->'", var_name, id));
        Ok(())
    }

    fn emit_component(&mut self, node: &ComponentNode, out: &mut Vec<String>, var_name: &str) -> Result<(), CompileError> {
        let id = self.next_anchor();
        let name_str = json_string(&node.name);
        let props_obj = self.build_component_props_obj(&node.props)?;
        let slots_obj = self.build_slots_obj(&node.slots)?;
        let id_str = json_string(&id.to_string());
        out.push(format!(
            "{} += '<!--f-component:{}:{}-->'",
            var_name, node.name, id
        ));
        out.push(format!(
            "{} += await renderComponentSSR(_components[{}], {}, {}, {})",
            var_name, name_str, props_obj, slots_obj, id_str
        ));
        out.push(format!("{} += '<!--/f-component:{}-->'", var_name, id));
        Ok(())
    }

    fn build_component_props_obj(&mut self, props: &[Prop]) -> Result<String, CompileError> {
        let mut entries = Vec::new();
        for p in props {
            match p {
                Prop::Attribute(a) => {
                    let val = match &a.value {
                        Some(v) => json_string(v),
                        None => "true".to_string(),
                    };
                    entries.push(format!("{}: {}", json_string(&a.name), val));
                }
                Prop::Binding(b) => {
                    let expr = self.wrap_expr(&b.expression.content);
                    entries.push(format!("{}: {}", json_string(&b.name), expr));
                }
                _ => {}
            }
        }
        Ok(format!("{{ {} }}", entries.join(", ")))
    }

    fn build_slots_obj(&mut self, slots: &[(String, Vec<Node>)]) -> Result<String, CompileError> {
        if slots.is_empty() {
            return Ok("{}".to_string());
        }
        let mut entries = Vec::new();
        for (name, children) in slots {
            let mut stmts: Vec<String> = vec!["let __s = ''".to_string()];
            self.emit_children(children, &mut stmts, "__s")?;
            stmts.push("return __s".to_string());
            let inner = stmts
                .iter()
                .map(|l| format!("        {}", l))
                .collect::<Vec<_>>()
                .join("\n");
            entries.push(format!("{}: () => {{\n{}\n    }}", json_string(name), inner));
        }
        Ok(format!("{{ {} }}", entries.join(", ")))
    }

    fn emit_slot_outlet(&mut self, node: &SlotOutletNode, out: &mut Vec<String>, var_name: &str) {
        let id = self.next_anchor();
        let name_str = json_string(&node.slot_name);
        let mut fallback_stmts: Vec<String> = vec!["let __f = ''".to_string()];
        for child in &node.fallback {
            let _ = self.emit_node(child, &mut fallback_stmts, "__f", false);
        }
        let fb = fallback_stmts.join("; ");
        out.push(format!("{} += '<!--f-slot:{}-->'", var_name, id));
        out.push(format!(
            "{} += (_ctx._slots && _ctx._slots[{}]) ? _ctx._slots[{}]() : (() => {{ {}; return __f }})()",
            var_name, name_str, name_str, fb
        ));
        out.push(format!("{} += '<!--/f-slot:{}-->'", var_name, id));
    }

    fn is_local(&self, id: &str) -> bool {
        self.local_scopes.iter().any(|s| s.contains(id))
    }

    fn wrap_expr(&mut self, expr: &str) -> String {
        if expr.contains("_ctx.") {
            return expr.to_string();
        }
        if is_dotted_identifier_path(expr.trim()) {
            let id = expr.trim().to_string();
            let root_var = id.split('.').next().unwrap_or("");
            if self.is_local(root_var) {
                return id;
            }
            return format!("ssrVal(_ctx.{})", id);
        }
        self.rewrite_expr(expr)
    }

    fn rewrite_expr(&self, expr: &str) -> String {
        let chars: Vec<char> = expr.chars().collect();
        let mut out = String::new();
        let mut i = 0;
        let mut skip_next_identifier = false;

        while i < chars.len() {
            let c = chars[i];

            if c == '\'' || c == '"' || c == '`' {
                let quote = c;
                out.push(c);
                i += 1;
                while i < chars.len() {
                    let cc = chars[i];
                    if cc == '\\' && i + 1 < chars.len() {
                        out.push(cc);
                        out.push(chars[i + 1]);
                        i += 2;
                        continue;
                    }
                    out.push(cc);
                    i += 1;
                    if cc == quote {
                        break;
                    }
                }
                continue;
            }

            if c.is_ascii_alphabetic() || c == '_' || c == '$' {
                let start = i;
                let mut j = i;
                while j < chars.len()
                    && (chars[j].is_ascii_alphanumeric() || chars[j] == '_' || chars[j] == '$')
                {
                    j += 1;
                }
                let id: String = chars[start..j].iter().collect();

                if skip_next_identifier {
                    out.push_str(&id);
                    skip_next_identifier = false;
                    i = j;
                    continue;
                }

                let preceded_by_dot_or_word = start > 0
                    && (chars[start - 1] == '.'
                        || chars[start - 1].is_ascii_alphanumeric()
                        || chars[start - 1] == '_'
                        || chars[start - 1] == '$');

                let mut preceded_by_colon = false;
                if start > 0 {
                    let mut p = start - 1;
                    while p > 0 && chars[p].is_whitespace() {
                        p -= 1;
                    }
                    if chars[p] == ':' {
                        preceded_by_colon = true;
                    }
                }

                let mut k = j;
                while k < chars.len() && chars[k].is_whitespace() {
                    k += 1;
                }
                let followed_by_colon = k < chars.len() && chars[k] == ':';

                if preceded_by_dot_or_word || preceded_by_colon || followed_by_colon {
                    out.push_str(&id);
                } else if SSR_GLOBALS.contains(id.as_str()) {
                    out.push_str(&id);
                    if id == "as" || id == "satisfies" {
                        skip_next_identifier = true;
                    }
                } else if self.is_local(&id) {
                    out.push_str(&id);
                } else {
                    out.push_str("ssrVal(_ctx.");
                    out.push_str(&id);
                    out.push_str(")");
                }
                i = j;
            } else {
                out.push(c);
                i += 1;
            }
        }

        out
    }
}

fn node_type_name(node: &Node) -> &'static str {
    match node {
        Node::Root(_) => "Root",
        Node::Element(_) => "Element",
        Node::Component(_) => "Component",
        Node::Text(_) => "Text",
        Node::Interpolation(_) => "Interpolation",
        Node::SlotOutlet(_) => "SlotOutlet",
        Node::SlotContent(_) => "SlotContent",
        Node::If(_) => "If",
    }
}

fn find_for_dir(node: &Node) -> Option<&DirectiveNode> {
    node.props()?
        .iter()
        .find_map(|p| p.as_directive().filter(|d| d.name == "for"))
}

fn with_props(node: Node, props: Vec<Prop>) -> Node {
    match node {
        Node::Element(mut e) => {
            e.props = props;
            Node::Element(e)
        }
        Node::Component(mut c) => {
            c.props = props;
            Node::Component(c)
        }
        other => other,
    }
}

fn collect_element_refs<'a>(node: &'a Node, out: &mut HashMap<NodeId, &'a ElementNode>) {
    match node {
        Node::Element(e) => {
            out.insert(e.id, e);
            for c in &e.children {
                collect_element_refs(c, out);
            }
        }
        Node::Component(c) => {
            for (_, children) in &c.slots {
                for child in children {
                    collect_element_refs(child, out);
                }
            }
        }
        Node::If(i) => {
            for b in &i.branches {
                collect_element_refs(&b.node, out);
            }
        }
        _ => {}
    }
}

fn json_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

fn is_dotted_identifier_path(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$' || c == '.')
}

static SSR_GLOBALS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        // literals / special values
        "true", "false", "null", "undefined", "NaN", "Infinity",
        // keywords
        "typeof", "instanceof", "in", "of", "new", "delete", "void",
        "return", "if", "else", "for", "while", "do", "switch", "case",
        "break", "continue", "throw", "try", "catch", "finally",
        "class", "function", "var", "let", "const", "import", "export",
        "async", "await", "yield", "static", "super", "this",
        // runtime helpers (already in scope via imports)
        "escapeHtml", "escapeAttr", "renderClass", "renderStyle",
        "ssrEnumerate", "renderComponentSSR", "ssrVal",
        // common browser / Node globals
        "console", "Math", "JSON", "Object", "Array", "String", "Number",
        "Boolean", "Date", "RegExp", "Error", "Promise", "Map", "Set",
        "Symbol", "WeakMap", "WeakSet", "globalThis", "window", "document",
        "parseInt", "parseFloat", "isNaN", "isFinite",
        "encodeURI", "decodeURI", "encodeURIComponent", "decodeURIComponent",
        "as", "satisfies",
    ]
    .into_iter()
    .collect()
});

use crate::args;
use crate::ast::*;
use crate::errors::{CompileError, ErrorCode};
use once_cell::sync::Lazy;
use std::collections::{HashMap, HashSet};

const DEFAULT_RUNTIME: &str = "fusee/runtime/h.js";

pub struct GenerateOptions {
    pub source: String,
    pub runtime_path: Option<String>,
}

pub fn generate(root: &RootNode, options: GenerateOptions) -> Result<String, CompileError> {
    let mut gen = Generator::new(&options.source, options.runtime_path.as_deref());
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

struct Generator<'a> {
    source: &'a str,
    runtime_path: String,
    imports: OrderedSet,
    hoisted_lookup: HashMap<NodeId, String>,
    hoisted_order: Vec<(NodeId, String)>,
    local_scopes: Vec<HashSet<String>>,
}

impl<'a> Generator<'a> {
    fn new(source: &'a str, runtime_path: Option<&str>) -> Self {
        Generator {
            source,
            runtime_path: runtime_path.unwrap_or(DEFAULT_RUNTIME).to_string(),
            imports: OrderedSet::new(&["h", "hText", "createComponent", "_effect", "_batch"]),
            hoisted_lookup: HashMap::new(),
            hoisted_order: Vec::new(),
            local_scopes: Vec::new(),
        }
    }

    fn generate(&mut self, root: &RootNode) -> Result<String, CompileError> {
        for (idx, id) in root.hoisted.iter().enumerate() {
            let name = format!("_s{}", idx);
            self.hoisted_lookup.insert(*id, name.clone());
            self.hoisted_order.push((*id, name));
        }
        
        let mut id_to_node: HashMap<NodeId, &ElementNode> = HashMap::new();
        for c in &root.children {
            collect_element_refs(c, &mut id_to_node);
        }
        
        let hoisted_order = self.hoisted_order.clone();
        let mut hoisted_decls = Vec::new();
        for (id, name) in &hoisted_order {
            if let Some(&node) = id_to_node.get(id) {
                let code = self.gen_element(node, true)?;
                hoisted_decls.push(format!("const {} = {}", name, code));
            }
        }

        let children = self.gen_children(&root.children)?;

        let import_list = self.imports.join(", ");
        let mut output = vec![format!("import {{ {} }} from '{}'", import_list, self.runtime_path), String::new(), ];
        if !hoisted_decls.is_empty() {
            output.extend(hoisted_decls);
            output.push(String::new());
        }
        output.push("export function render(_ctx, _components) {".to_string());
        output.push("    return [".to_string());
        output.push(
            children
                .iter()
                .map(|l| format!("        {}", l))
                .collect::<Vec<_>>()
                .join(",\n"),
        );
        output.push("    ]".to_string());
        output.push("}".to_string());

        Ok(output.join("\n"))
    }

    fn gen_children(&mut self, children: &[Node]) -> Result<Vec<String>, CompileError> {
        let mut out = Vec::new();
        for child in children {
            if let Some(for_dir) = find_for_dir(child) {
                out.push(self.gen_for_node(child, for_dir)?);
            } else {
                out.push(self.gen_node(child, false)?);
            }
        }
        Ok(out)
    }

    fn gen_node(&mut self, node: &Node, in_hoist: bool) -> Result<String, CompileError> {
        if !in_hoist {
            if let Node::Element(e) = node {
                if let Some(name) = self.hoisted_lookup.get(&e.id) {
                    return Ok(name.clone());
                }
            }
        }

        match node {
            Node::Text(t) => Ok(self.gen_text(t)),
            Node::Interpolation(i) => Ok(self.gen_interpolation(i)),
            Node::Element(e) => self.gen_element(e, false),
            Node::Component(c) => self.gen_component(c),
            Node::SlotOutlet(s) => self.gen_slot_outlet(s),
            Node::If(i) => self.gen_if(i),
            other => Err(CompileError::new(
                ErrorCode::UnknownNodeType,
                other.loc().clone(),
                self.source,
                args!(node_type_name(other)),
            )),
        }
    }

    fn gen_text(&self, node: &TextNode) -> String {
        format!("hText({})", json_string(&node.content))
    }

    fn gen_interpolation(&mut self, node: &InterpolationNode) -> String {
        self.imports.add("_effect");
        let expr = &node.expression.content;
        if node.expression.is_static {
            format!("hText(String({}))", expr)
        } else {
            format!("hText(() => String({}))", self.wrap_expr(expr))
        }
    }

    fn gen_element(&mut self, node: &ElementNode, in_hoist: bool) -> Result<String, CompileError> {
        let tag = json_string(&node.tag);
        let props = self.gen_props(&node.props)?;
        let children = self.gen_children_array(&node.children, in_hoist)?;
        let mut args = vec![tag, props, children];
        if node.is_static {
            args.push("true".to_string());
        }
        Ok(format!("h({})", args.join(", ")))
    }

    fn gen_component(&mut self, node: &ComponentNode) -> Result<String, CompileError> {
        self.imports.add("createComponent");
        let name = json_string(&node.name);
        let props = self.gen_component_props(&node.props)?;
        let slots = self.gen_slots(&node.slots)?;
        Ok(format!(
            "createComponent({}, _components[{}], {}, {})",
            name, name, props, slots
        ))
    }

    fn gen_slot_outlet(&mut self, node: &SlotOutletNode) -> Result<String, CompileError> {
        self.imports.add("hSlot");
        let name = json_string(&node.slot_name);
        let fallback = self.gen_children_array(&node.fallback, false)?;
        Ok(format!("hSlot(_ctx._slots, {}, {})", name, fallback))
    }

    fn gen_if(&mut self, node: &IfNode) -> Result<String, CompileError> {
        self.imports.add("hIf");
        let mut branches = Vec::new();
        for branch in &node.branches {
            let cond = match &branch.condition {
                Some(c) => self.wrap_expr(&c.content),
                None => "true".to_string(),
            };
            let children = match branch.node.as_ref().children() {
                Some(c) => self.gen_children_array(c, false)?,
                None => "[]".to_string(),
            };
            branches.push(format!("[() => {}, () => {}]", cond, children));
        }
        Ok(format!("hIf([\n        {}\n    ])", branches.join(",\n        ")))
    }

    fn gen_props(&mut self, props: &[Prop]) -> Result<String, CompileError> {
        if props.is_empty() {
            return Ok("{}".to_string());
        }
        let mut entries = Vec::new();
        for prop in props {
            match prop {
                Prop::Attribute(a) => entries.push(self.gen_attr_entry(a)),
                Prop::Binding(b) => entries.push(self.gen_binding_entry(b)),
                Prop::Event(e) => entries.push(self.gen_event_entry(e)),
                Prop::Directive(d) => self.gen_directive_entries(d, &mut entries)?,
            }
        }
        Ok(format!("{{\n        {}\n    }}", entries.join(",\n        ")))
    }

    fn gen_attr_entry(&self, prop: &AttributeNode) -> String {
        let value = match &prop.value {
            Some(v) => json_string(v),
            None => "true".to_string(),
        };
        format!("{}: {}", json_string(&prop.name), value)
    }

    fn gen_binding_entry(&mut self, prop: &BindingNode) -> String {
        let expr = self.wrap_expr(&prop.expression.content);
        if prop.is_prop {
            format!("{}: () => {}", json_string(&format!("prop:{}", prop.name)), expr)
        } else {
            format!("{}: () => {}", json_string(&prop.name), expr)
        }
    }

    fn gen_event_entry(&mut self, prop: &EventNode) -> String {
        let key = json_string(&format!("@{}", prop.name));
        let handler_js = self.gen_handler_expr(&prop.expression.content);
        let mods = json_array(&prop.modifiers);
        format!("{}: {{ handler: {}, modifiers: {} }}", key, handler_js, mods)
    }

    fn gen_handler_expr(&self, expr: &str) -> String {
        if is_simple_identifier(expr.trim()) {
            format!("_ctx.{}", expr.trim())
        } else {
            format!("($event) => {{ {} }}", expr)
        }
    }

    fn gen_directive_entries(&mut self, dir: &DirectiveNode, entries: &mut Vec<String>, ) -> Result<(), CompileError> {
        match dir.name.as_str() {
            "if" | "else-if" | "else" | "for" => {}
            "show" => {
                let expr = self.wrap_expr(&dir.expression.as_ref().unwrap().content);
                entries.push(format!("'f-show': () => {}", expr));
            }
            "model" => {
                let expr = dir.expression.as_ref().unwrap().content.clone();
                entries.push(format!("'f-model': () => _ctx.{}", expr));
                entries.push(format!(
                    "'@input': {{ handler: ($e) => {{ _ctx.{}($e.target.value) }}, modifiers: [] }}",
                    expr
                ));
            }
            "html" => {
                let expr = self.wrap_expr(&dir.expression.as_ref().unwrap().content);
                entries.push(format!("'f-html': () => {}", expr));
            }
            "ref" => {
                let name = dir.expression.as_ref().unwrap().content.trim().to_string();
                entries.push(format!("'f-ref': {}", json_string(&name)));
            }
            "once" => {
                entries.push("'f-once': true".to_string());
            }
            other => {
                let value = match &dir.expression {
                    Some(e) => format!("() => {}", self.wrap_expr(&e.content)),
                    None => "true".to_string(),
                };
                entries.push(format!("{}: {}", json_string(&format!("f-{}", other)), value));
            }
        }
        Ok(())
    }

    fn gen_component_props(&mut self, props: &[Prop]) -> Result<String, CompileError> {
        if props.is_empty() {
            return Ok("{}".to_string());
        }
        let mut entries = Vec::new();
        for prop in props {
            match prop {
                Prop::Attribute(a) => {
                    let value = match &a.value {
                        Some(v) => json_string(v),
                        None => "true".to_string(),
                    };
                    entries.push(format!("{}: {}", json_string(&a.name), value));
                }
                Prop::Binding(b) => {
                    let expr = self.wrap_expr(&b.expression.content);
                    entries.push(format!("{}: () => {}", json_string(&b.name), expr));
                }
                Prop::Event(e) => {
                    let handler_js = self.gen_handler_expr(&e.expression.content);
                    entries.push(format!("{}: {}", json_string(&format!("on:{}", e.name)), handler_js));
                }
                Prop::Directive(_) => {}
            }
        }
        Ok(format!("{{ {} }}", entries.join(", ")))
    }

    fn gen_slots(&mut self, slots: &[(String, Vec<Node>)]) -> Result<String, CompileError> {
        if slots.is_empty() {
            return Ok("{}".to_string());
        }
        let mut entries = Vec::new();
        for (name, children) in slots {
            let children_js = self.gen_children_array(children, false)?;
            entries.push(format!("{}: () => {}", json_string(name), children_js));
        }
        Ok(format!("{{ {} }}", entries.join(", ")))
    }

    fn gen_children_array(&mut self, children: &[Node], in_hoist: bool) -> Result<String, CompileError> {
        if children.is_empty() {
            return Ok("[]".to_string());
        }
        let mut expanded = Vec::new();
        for child in children {
            if let Some(for_dir) = find_for_dir(child) {
                expanded.push(self.gen_for_node(child, for_dir)?);
            } else {
                expanded.push(self.gen_node(child, in_hoist)?);
            }
        }
        if expanded.len() == 1 {
            Ok(format!("[{}]", expanded[0]))
        } else {
            Ok(format!("[\n        {}\n    ]", expanded.join(",\n        ")))
        }
    }

    fn gen_for_node(&mut self, node: &Node, for_dir: &DirectiveNode) -> Result<String, CompileError> {
        self.imports.add("hFor");
        let for_arg = for_dir.arg.as_ref().expect("f-for must have parsed arg");
        let item = for_arg.item.clone();
        let index = for_arg.index.clone();
        let source_js = self.wrap_expr(&for_arg.source);

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
        let item_param_str = format!("({})", item_param);
        let inner_js = self.gen_node(&inner_node, false)?;
        let key_js = self.wrap_expr(&key_expr);

        self.local_scopes.pop();

        Ok(format!(
            "hFor(\n        () => {},\n        {} => {},\n        {} => {}\n    )",
            source_js, item_param_str, inner_js, item_param_str, key_js
        ))
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
            return format!(
                "(typeof _ctx.{} === 'function' && _ctx.{}.isSignal ? _ctx.{}() : _ctx.{})",
                id, id, id, id
            );
        }
        self.rewrite_expr(expr)
    }

    fn rewrite_expr(&self, expr: &str) -> String {
        let chars: Vec<char> = expr.chars().collect();
        let mut out = String::new();
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

                let preceded_by_dot_or_word = start > 0
                    && (chars[start - 1] == '.'
                    || chars[start - 1].is_ascii_alphanumeric()
                    || chars[start - 1] == '_'
                    || chars[start - 1] == '$');

                let mut k = j;
                while k < chars.len() && chars[k].is_whitespace() {
                    k += 1;
                }
                let followed_by_colon = k < chars.len() && chars[k] == ':';

                if preceded_by_dot_or_word || followed_by_colon {
                    out.push_str(&id);
                } else if GENERATOR_GLOBALS.contains(id.as_str()) {
                    out.push_str(&id);
                } else if self.is_local(&id) {
                    out.push_str(&id);
                } else {
                    out.push_str("_ctx.");
                    out.push_str(&id);
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

fn json_array(items: &[String]) -> String {
    serde_json::to_string(items).unwrap_or_else(|_| "[]".to_string())
}

fn is_simple_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
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

static GENERATOR_GLOBALS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "true", "false", "null", "undefined", "NaN", "Infinity", "Array", "Object", "String",
        "Number", "Boolean", "Date", "Math", "JSON", "Promise", "Map", "Set", "Symbol",
        "parseInt", "parseFloat", "isNaN", "isFinite", "console", "typeof", "instanceof", "void",
        "delete", "new", "return", "if", "else", "for", "while", "do", "switch", "case", "break",
        "continue", "function", "class", "const", "let", "var", "import", "export", "default",
        "this",
    ]
        .into_iter()
        .collect()
});
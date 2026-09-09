use serde::{Deserialize, Serialize};

pub type NodeId = usize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Pos {
    pub line: usize,
    pub col: usize,
    pub offset: usize,
}

impl Pos {
    pub fn new(line: usize, col: usize, offset: usize) -> Self {
        Pos { line, col, offset }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct Loc {
    pub start: Pos,
    pub end: Pos,
}

impl Loc {
    pub fn new(start: Pos, end: Pos) -> Self {
        Loc { start, end }
    }
    pub fn point(p: Pos) -> Self {
        Loc { start: p, end: p }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Expression {
    pub content: String,
    pub is_static: bool,
    pub is_for_key: bool,
    pub loc: Loc,
}

impl Expression {
    pub fn new(content: impl Into<String>, is_static: bool, loc: Loc) -> Self {
        Expression {
            content: content.into(),
            is_static,
            is_for_key: false,
            loc,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttributeNode {
    pub name: String,
    pub value: Option<String>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BindingNode {
    pub name: String,
    pub expression: Expression,
    pub is_prop: bool,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventNode {
    pub name: String,
    pub expression: Expression,
    pub modifiers: Vec<String>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForArg {
    pub item: String,
    pub source: String,
    pub index: Option<String>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectiveNode {
    pub name: String,
    pub expression: Option<Expression>,
    pub arg: Option<ForArg>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Prop {
    Attribute(AttributeNode),
    Binding(BindingNode),
    Event(EventNode),
    Directive(DirectiveNode),
}

impl Prop {
    pub fn loc(&self) -> &Loc {
        match self {
            Prop::Attribute(a) => &a.loc,
            Prop::Binding(b) => &b.loc,
            Prop::Event(e) => &e.loc,
            Prop::Directive(d) => &d.loc,
        }
    }

    pub fn as_directive(&self) -> Option<&DirectiveNode> {
        match self {
            Prop::Directive(d) => Some(d),
            _ => None,
        }
    }

    pub fn as_binding(&self) -> Option<&BindingNode> {
        match self {
            Prop::Binding(b) => Some(b),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub condition: Option<Expression>,
    pub node: Box<Node>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementNode {
    pub id: NodeId,
    pub tag: String,
    pub props: Vec<Prop>,
    pub children: Vec<Node>,
    pub self_closing: bool,
    pub is_static: bool,
    pub hoisted: bool,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentNode {
    pub id: NodeId,
    pub name: String,
    pub props: Vec<Prop>,
    pub slots: Vec<(String, Vec<Node>)>,
    pub loc: Loc,
}

impl ComponentNode {
    pub fn slot(&self, name: &str) -> Option<&Vec<Node>> {
        self.slots.iter().find(|(n, _)| n == name).map(|(_, c)| c)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextNode {
    pub content: String,
    pub is_static: bool,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterpolationNode {
    pub expression: Expression,
    pub is_static: bool,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlotOutletNode {
    pub slot_name: String,
    pub fallback: Vec<Node>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlotContentNode {
    pub slot_name: String,
    pub children: Vec<Node>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfNode {
    pub branches: Vec<Branch>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootNode {
    pub children: Vec<Node>,
    pub hoisted: Vec<NodeId>,
    pub loc: Loc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Node {
    Root(RootNode),
    Element(ElementNode),
    Component(ComponentNode),
    Text(TextNode),
    Interpolation(InterpolationNode),
    SlotOutlet(SlotOutletNode),
    SlotContent(SlotContentNode),
    If(IfNode),
}

impl Node {
    pub fn loc(&self) -> &Loc {
        match self {
            Node::Root(n) => &n.loc,
            Node::Element(n) => &n.loc,
            Node::Component(n) => &n.loc,
            Node::Text(n) => &n.loc,
            Node::Interpolation(n) => &n.loc,
            Node::SlotOutlet(n) => &n.loc,
            Node::SlotContent(n) => &n.loc,
            Node::If(n) => &n.loc,
        }
    }

    pub fn is_element(&self) -> bool {
        matches!(self, Node::Element(_))
    }
    pub fn is_component(&self) -> bool {
        matches!(self, Node::Component(_))
    }
    pub fn is_element_or_component(&self) -> bool {
        self.is_element() || self.is_component()
    }

    pub fn props(&self) -> Option<&Vec<Prop>> {
        match self {
            Node::Element(n) => Some(&n.props),
            Node::Component(n) => Some(&n.props),
            _ => None,
        }
    }

    pub fn children(&self) -> Option<&Vec<Node>> {
        match self {
            Node::Root(n) => Some(&n.children),
            Node::Element(n) => Some(&n.children),
            _ => None,
        }
    }

    pub fn find_directive(&self, name: &str) -> Option<&DirectiveNode> {
        self.props()?
            .iter()
            .find_map(|p| p.as_directive().filter(|d| d.name == name))
    }

    pub fn tag_or_name(&self) -> &str {
        match self {
            Node::Element(n) => &n.tag,
            Node::Component(n) => &n.name,
            _ => "",
        }
    }

    pub fn set_is_static(&mut self, v: bool) {
        match self {
            Node::Element(n) => n.is_static = v,
            Node::Text(n) => n.is_static = v,
            Node::Interpolation(n) => n.is_static = v,
            _ => {}
        }
    }
}
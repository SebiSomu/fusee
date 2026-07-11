use crate::args;
use crate::ast::*;
use crate::errors::{CompileError, ErrorCode};
use crate::lexer::{Token, TokenType};
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

static VOID_ELEMENTS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
        "source", "track", "wbr",
    ]
        .into_iter()
        .collect()
});

// mirror exact al FOR_RE din parser.js
static FOR_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(?:\(\s*([^,)]+?)\s*(?:,\s*([^)]+?)\s*)?\))\s+in\s+(.+)$|^([^\s,]+)\s+in\s+(.+)$")
        .unwrap()
});

pub fn parse(tokens: Vec<Token>, source: &str, components: &HashSet<String>) -> Result<Node, CompileError> {
    let mut parser = Parser::new(tokens, source, components);
    parser.parse()
}

struct Parser<'a> {
    tokens: Vec<Token>,
    source: String,
    components: &'a HashSet<String>,
    pos: usize,
    stack: Vec<String>,
    next_id: NodeId,
}

impl<'a> Parser<'a> {
    fn new(tokens: Vec<Token>, source: &str, components: &'a HashSet<String>) -> Self {
        Parser {
            tokens,
            source: source.to_string(),
            components,
            pos: 0,
            stack: Vec::new(),
            next_id: 0,
        }
    }

    fn alloc_id(&mut self) -> NodeId {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    fn parse(&mut self) -> Result<Node, CompileError> {
        let start = self.start_loc();
        let children = self.parse_children(None)?;
        Ok(Node::Root(RootNode {
            children,
            hoisted: Vec::new(),
            loc: Loc::new(start, self.start_loc()),
        }))
    }

    fn parse_children(&mut self, _parent_tag: Option<&str>) -> Result<Vec<Node>, CompileError> {
        let mut children = Vec::new();

        loop {
            if self.eof() {
                break;
            }
            let tok = self.peek().unwrap();

            match tok.ttype {
                TokenType::Eof => break,
                TokenType::TagOpenClose => break,
                TokenType::Comment => {
                    self.advance();
                    continue;
                }
                TokenType::Text => {
                    children.push(self.parse_text()?);
                    continue;
                }
                TokenType::MustacheOpen => {
                    children.push(self.parse_mustache()?);
                    continue;
                }
                TokenType::TagOpen => {
                    if let Some(node) = self.parse_element()? {
                        children.push(node);
                    }
                    continue;
                }
                _ => {
                    self.advance();
                }
            }
        }

        Ok(children)
    }

    fn parse_text(&mut self) -> Result<Node, CompileError> {
        let tok = self.consume(TokenType::Text)?;
        Ok(Node::Text(TextNode {
            content: tok.value,
            is_static: false,
            loc: tok.loc,
        }))
    }

    fn parse_mustache(&mut self) -> Result<Node, CompileError> {
        let open = self.consume(TokenType::MustacheOpen)?;
        let expr = self.consume(TokenType::MustacheExpr)?;
        let close = self.consume(TokenType::MustacheClose)?;

        if expr.value.trim().is_empty() {
            return Err(self.err(ErrorCode::EmptyExpression, expr.loc.clone(), args!("{{ }}")));
        }

        let loc = Loc::new(open.loc.start, close.loc.end);
        Ok(Node::Interpolation(InterpolationNode {
            expression: Expression::new(expr.value, false, expr.loc),
            is_static: false,
            loc,
        }))
    }

    fn parse_element(&mut self) -> Result<Option<Node>, CompileError> {
        let open_tok = self.consume(TokenType::TagOpen)?;
        let tag = open_tok.value.clone();
        let start_loc = open_tok.loc.start;
        let props = self.parse_attrs(&tag)?;

        let mut self_closing = false;
        if matches!(self.peek().map(|t| t.ttype), Some(TokenType::TagSelfClose)) {
            self.advance();
            self_closing = true;
        } else {
            self.consume(TokenType::TagClose)?;
        }

        if tag == "slot" {
            return Ok(Some(self.build_slot_outlet(props, start_loc, self_closing)?));
        }

        let slot_attr = props
            .iter()
            .find(|p| matches!(p, Prop::Attribute(a) if a.name == "slot"))
            .cloned();

        if tag == "template" {
            if let Some(Prop::Attribute(attr)) = slot_attr {
                return Ok(Some(
                    self.build_slot_content(attr, start_loc, self_closing)?,
                ));
            }
        }

        if self_closing || VOID_ELEMENTS.contains(tag.to_lowercase().as_str()) {
            return Ok(Some(self.build_node(tag, props, Vec::new(), true, start_loc, None)?));
        }

        self.stack.push(tag.clone());
        let children = self.parse_children(Some(&tag))?;
        self.stack.pop();

        if matches!(self.peek().map(|t| t.ttype), Some(TokenType::TagOpenClose)) {
            let close_tok = self.advance().unwrap();
            if close_tok.value.to_lowercase() != tag.to_lowercase() {
                return Err(self.err(
                    ErrorCode::UnexpectedClosingTag,
                    close_tok.loc.clone(),
                    args!(close_tok.value),
                ));
            }
            if matches!(self.peek().map(|t| t.ttype), Some(TokenType::TagClose)) {
                self.advance();
            }
        } else {
            return Err(self.err(
                ErrorCode::MissingClosingTag,
                Loc::new(start_loc, start_loc),
                args!(tag),
            ));
        }

        let end_loc = self.start_loc();
        Ok(Some(self.build_node(
            tag,
            props,
            children,
            false,
            start_loc,
            Some(end_loc),
        )?))
    }

    fn build_node(&mut self, tag: String, props: Vec<Prop>, children: Vec<Node>, self_closing: bool, start_loc: Pos, end_loc: Option<Pos>) -> Result<Node, CompileError> {
        let loc = Loc::new(start_loc, end_loc.unwrap_or(start_loc));
        let is_capitalized = tag.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false);

        if self.components.contains(&tag) || is_capitalized {
            let slots = self.extract_slots(children);
            let id = self.alloc_id();
            return Ok(Node::Component(ComponentNode {
                id,
                name: tag,
                props,
                slots,
                loc,
            }));
        }

        let id = self.alloc_id();
        Ok(Node::Element(ElementNode {
            id,
            tag,
            props,
            children,
            self_closing,
            is_static: false,
            hoisted: false,
            loc,
        }))
    }

    fn build_slot_outlet(&mut self, props: Vec<Prop>, start_loc: Pos, self_closing: bool, ) -> Result<Node, CompileError> {
        let name_attr = props
            .iter()
            .find(|p| matches!(p, Prop::Attribute(a) if a.name == "name"));
        let slot_name = match name_attr {
            Some(Prop::Attribute(a)) => a.value.clone().unwrap_or_else(|| "default".to_string()),
            _ => "default".to_string(),
        };

        let mut fallback = Vec::new();
        if !self_closing {
            self.stack.push("slot".to_string());
            fallback = self.parse_children(Some("slot"))?;
            self.stack.pop();
            if matches!(self.peek().map(|t| t.ttype), Some(TokenType::TagOpenClose)) {
                self.advance();
                if matches!(self.peek().map(|t| t.ttype), Some(TokenType::TagClose)) {
                    self.advance();
                }
            }
        }

        Ok(Node::SlotOutlet(SlotOutletNode {
            slot_name,
            fallback,
            loc: Loc::new(start_loc, self.start_loc()),
        }))
    }

    fn build_slot_content(&mut self, slot_attr: AttributeNode, start_loc: Pos, self_closing: bool) -> Result<Node, CompileError> {
        let slot_name = slot_attr.value.clone().unwrap_or_else(|| "default".to_string());
        let mut children = Vec::new();

        if !self_closing {
            self.stack.push("template".to_string());
            children = self.parse_children(Some("template"))?;
            self.stack.pop();
            if matches!(self.peek().map(|t| t.ttype), Some(TokenType::TagOpenClose)) {
                self.advance();
                if matches!(self.peek().map(|t| t.ttype), Some(TokenType::TagClose)) {
                    self.advance();
                }
            }
        }

        Ok(Node::SlotContent(SlotContentNode {
            slot_name,
            children,
            loc: Loc::new(start_loc, self.start_loc()),
        }))
    }

    fn extract_slots(&self, children: Vec<Node>) -> Vec<(String, Vec<Node>)> {
        let mut slots: Vec<(String, Vec<Node>)> = vec![("default".to_string(), Vec::new())];

        for child in children {
            if let Node::SlotContent(sc) = child {
                if let Some(entry) = slots.iter_mut().find(|(n, _)| *n == sc.slot_name) {
                    entry.1 = sc.children;
                } else {
                    slots.push((sc.slot_name, sc.children));
                }
            } else {
                slots[0].1.push(child);
            }
        }

        slots
    }

    fn parse_attrs(&mut self, tag: &str) -> Result<Vec<Prop>, CompileError> {
        let mut props = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        loop {
            if self.eof() {
                break;
            }
            let tok = self.peek().unwrap();
            if matches!(
                tok.ttype,
                TokenType::TagClose | TokenType::TagSelfClose | TokenType::Eof
            ) {
                break;
            }

            if tok.ttype != TokenType::AttrName {
                self.advance();
                continue;
            }

            let name_tok = self.advance().unwrap();
            let raw_name = name_tok.value.clone();
            if seen.contains(&raw_name) {
                return Err(self.err(
                    ErrorCode::DuplicateKey,
                    name_tok.loc.clone(),
                    args!(raw_name, tag.to_string()),
                ));
            }
            seen.insert(raw_name.clone());

            let mut value: Option<String> = None;
            if matches!(self.peek().map(|t| t.ttype), Some(TokenType::AttrEquals)) {
                self.advance();
                let val_tok = self.consume(TokenType::AttrValue)?;
                value = Some(val_tok.value);
            }

            let loc = name_tok.loc.clone();

            if let Some(rest) = raw_name.strip_prefix('@') {
                props.push(self.parse_event_attr(rest, value, loc)?);
            } else if let Some(rest) = raw_name.strip_prefix(':') {
                props.push(self.parse_binding_attr(&raw_name, rest, value, loc)?);
            } else if let Some(rest) = raw_name.strip_prefix("f-") {
                props.push(self.parse_directive_attr(&raw_name, rest, value, loc, tag)?);
            } else {
                props.push(Prop::Attribute(AttributeNode {
                    name: raw_name,
                    value,
                    loc,
                }));
            }
        }

        Ok(props)
    }

    fn parse_event_attr(&mut self, rest: &str, value: Option<String>, loc: Loc) -> Result<Prop, CompileError> {
        let mut parts = rest.split('.');
        let event_name = parts.next().unwrap_or("").to_string();
        let modifiers: Vec<String> = parts.map(|s| s.to_string()).collect();

        let val = match &value {
            Some(v) if !v.trim().is_empty() => v.clone(),
            _ => {
                return Err(self.err(
                    ErrorCode::EmptyExpression,
                    loc,
                    args!(format!("@{}", rest)),
                ))
            }
        };

        Ok(Prop::Event(EventNode {
            name: event_name,
            expression: Expression::new(val.trim().to_string(), false, loc.clone()),
            modifiers,
            loc,
        }))
    }

    fn parse_binding_attr(&mut self, raw_name: &str, rest: &str, value: Option<String>, loc: Loc) -> Result<Prop, CompileError> {
        let is_prop = rest.starts_with("prop-");
        let name = if is_prop { &rest[5..] } else { rest };

        let val = match &value {
            Some(v) if !v.trim().is_empty() => v.clone(),
            _ => return Err(self.err(ErrorCode::EmptyExpression, loc, args!(raw_name.to_string()))),
        };

        Ok(Prop::Binding(BindingNode {
            name: name.to_string(),
            expression: Expression::new(val.trim().to_string(), false, loc.clone()),
            is_prop,
            loc,
        }))
    }

    fn parse_directive_attr(&mut self, raw_name: &str, rest: &str, value: Option<String>, loc: Loc, _tag: &str, ) -> Result<Prop, CompileError> {
        let name = rest.to_string();
        let needs_expr = name != "else" && name != "once";

        if needs_expr {
            match &value {
                Some(v) if !v.trim().is_empty() => {}
                _ => {
                    return Err(self.err(
                        ErrorCode::EmptyExpression,
                        loc,
                        args!(raw_name.to_string()),
                    ))
                }
            }
        }

        let mut expression = None;
        let mut arg = None;

        if let Some(v) = &value {
            if name == "for" {
                arg = Some(self.parse_for_expression(v.trim(), loc.clone())?);
            } else {
                expression = Some(Expression::new(v.trim().to_string(), false, loc.clone()));
            }
        }

        Ok(Prop::Directive(DirectiveNode {
            name,
            expression,
            arg,
            loc,
        }))
    }

    fn parse_for_expression(&mut self, raw: &str, loc: Loc) -> Result<ForArg, CompileError> {
        let caps = FOR_RE.captures(raw);
        let caps = match caps {
            Some(c) => c,
            None => {
                return Err(self.err(
                    ErrorCode::InvalidForSyntax,
                    loc,
                    args!(raw.to_string()),
                ))
            }
        };

        let item = caps
            .get(1)
            .or_else(|| caps.get(4))
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        let index = caps.get(2).map(|m| m.as_str().trim().to_string());
        let source = caps
            .get(3)
            .or_else(|| caps.get(5))
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();

        Ok(ForArg {
            item,
            source,
            index,
            loc,
        })
    }

    fn eof(&self) -> bool {
        self.pos >= self.tokens.len() || matches!(self.peek().map(|t| t.ttype), Some(TokenType::Eof))
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn advance(&mut self) -> Option<Token> {
        let tok = self.tokens.get(self.pos).cloned();
        if !matches!(tok.as_ref().map(|t| t.ttype), Some(TokenType::Eof)) {
            self.pos += 1;
        }
        tok
    }

    fn consume(&mut self, expected: TokenType) -> Result<Token, CompileError> {
        let tok = self.peek().cloned();
        match &tok {
            Some(t) if t.ttype == expected => {
                self.advance();
                Ok(t.clone())
            }
            _ => {
                let loc = tok
                    .as_ref()
                    .map(|t| t.loc.clone())
                    .unwrap_or_else(|| Loc::new(self.start_loc(), self.start_loc()));
                let found = tok
                    .map(|t| format!("{:?}", t.ttype))
                    .unwrap_or_else(|| "EOF".to_string());
                Err(self.err(
                    ErrorCode::UnexpectedToken,
                    loc,
                    args!(found, format!("{:?}", expected)),
                ))
            }
        }
    }

    fn start_loc(&self) -> Pos {
        self.peek().map(|t| t.loc.start).unwrap_or_default()
    }

    fn err(&self, code: ErrorCode, loc: Loc, args: Vec<String>) -> CompileError {
        CompileError::new(code, loc, &self.source, args)
    }
}
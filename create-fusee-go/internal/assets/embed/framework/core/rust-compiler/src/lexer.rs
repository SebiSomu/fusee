use crate::args;
use crate::ast::{Loc, Pos};
use crate::errors::{CompileError, ErrorCode};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum TokenType {
    TagOpen,
    TagOpenClose,
    TagClose,
    TagSelfClose,
    Comment,
    AttrName,
    AttrEquals,
    AttrValue,
    Text,
    MustacheOpen,
    MustacheExpr,
    MustacheClose,
    Eof,
}

#[derive(Debug, Clone, Serialize)]
pub struct Token {
    pub ttype: TokenType,
    pub value: String,
    pub loc: Loc,
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum Mode {
    Text,
    Tag,
}

pub fn tokenize(source: &str) -> Result<Vec<Token>, CompileError> {
    let mut lexer = Lexer::new(source);
    lexer.tokenize()
}

struct Lexer {
    chars: Vec<char>,
    source: String,
    tokens: Vec<Token>,
    pos: usize,
    line: usize,
    col: usize,
    mode: Mode,
}

impl Lexer {
    fn new(source: &str) -> Self {
        Lexer {
            chars: source.chars().collect(),
            source: source.to_string(),
            tokens: Vec::new(),
            pos: 0,
            line: 1,
            col: 1,
            mode: Mode::Text,
        }
    }

    fn tokenize(&mut self) -> Result<Vec<Token>, CompileError> {
        while !self.eof() {
            match self.mode {
                Mode::Text => self.read_text()?,
                Mode::Tag => self.read_in_tag()?,
            }
        }
        let start = self.start_pos();
        self.push(TokenType::Eof, String::new(), start);
        Ok(std::mem::take(&mut self.tokens))
    }

    fn read_text(&mut self) -> Result<(), CompileError> {
        if self.looking_at("<!--") {
            return self.read_comment();
        }
        if self.looking_at("</") {
            return self.read_closing_tag();
        }
        if self.peek() == Some('<') && self.is_tag_name_start(self.peek_at(1)) {
            return self.read_open_tag();
        }
        if self.looking_at("{{") {
            return self.read_mustache();
        }

        let start = self.start_pos();
        let mut text = String::new();
        while !self.eof() {
            if self.peek() == Some('<') || self.looking_at("{{") {
                break;
            }
            text.push(self.advance());
        }
        if !text.is_empty() {
            self.push(TokenType::Text, text, start);
        }
        Ok(())
    }

    fn read_open_tag(&mut self) -> Result<(), CompileError> {
        let start = self.start_pos();
        self.consume("<")?;
        let name = self.read_tag_name();
        self.push(TokenType::TagOpen, name, start);
        self.mode = Mode::Tag;
        Ok(())
    }

    fn read_closing_tag(&mut self) -> Result<(), CompileError> {
        let start = self.start_pos();
        self.consume("</")?;
        let name = self.read_tag_name();
        self.push(TokenType::TagOpenClose, name, start);
        self.skip_whitespace();
        if !self.eof() && self.peek() == Some('>') {
            let close_start = self.start_pos();
            self.consume(">")?;
            self.push(TokenType::TagClose, ">".into(), close_start);
        }
        Ok(())
    }

    fn read_comment(&mut self) -> Result<(), CompileError> {
        let start = self.start_pos();
        self.consume("<!--")?;
        let mut content = String::new();
        while !self.eof() && !self.looking_at("-->") {
            content.push(self.advance());
        }
        if self.eof() {
            return Err(CompileError::new(
                ErrorCode::MalformedComment,
                Loc::new(start, self.start_pos()),
                &self.source,
                args!(),
            ));
        }
        self.consume("-->")?;
        self.push(TokenType::Comment, content.trim().to_string(), start);
        Ok(())
    }

    fn read_mustache(&mut self) -> Result<(), CompileError> {
        let open_start = self.start_pos();
        self.consume("{{")?;
        self.push(TokenType::MustacheOpen, "{{".into(), open_start);

        let expr_start = self.start_pos();
        let mut expr = String::new();
        let mut depth = 0i32;
        let mut in_str = false;
        let mut str_char: Option<char> = None;

        while !self.eof() {
            let ch = self.peek().unwrap();

            if in_str {
                if ch == '\\' {
                    expr.push(self.advance());
                    if !self.eof() {
                        expr.push(self.advance());
                    }
                    continue;
                }
                if Some(ch) == str_char {
                    in_str = false;
                }
                expr.push(self.advance());
                continue;
            }

            if ch == '"' || ch == '\'' || ch == '`' {
                in_str = true;
                str_char = Some(ch);
                expr.push(self.advance());
                continue;
            }
            if ch == '{' {
                depth += 1;
                expr.push(self.advance());
                continue;
            }
            if ch == '}' {
                if depth > 0 {
                    depth -= 1;
                    expr.push(self.advance());
                    continue;
                }
                if self.peek_at(1) == Some('}') {
                    self.push(TokenType::MustacheExpr, expr.trim().to_string(), expr_start);
                    let close_start = self.start_pos();
                    self.consume("}}")?;
                    self.push(TokenType::MustacheClose, "}}".into(), close_start);
                    return Ok(());
                }
            }

            expr.push(self.advance());
        }

        Err(CompileError::new(
            ErrorCode::UnterminatedMustache,
            Loc::new(open_start, self.start_pos()),
            &self.source,
            args!(expr),
        ))
    }

    fn read_in_tag(&mut self) -> Result<(), CompileError> {
        self.skip_whitespace();
        if self.eof() {
            return Ok(());
        }

        if self.matches("/>") {
            self.push(TokenType::TagSelfClose, "/>".into(), self.start_pos());
            self.mode = Mode::Text;
            return Ok(());
        }

        if self.peek() == Some('>') {
            self.consume(">")?;
            self.push(TokenType::TagClose, ">".into(), self.start_pos());
            self.mode = Mode::Text;
            return Ok(());
        }

        let start = self.start_pos();
        let name = self.read_attr_name();
        let name = match name {
            Some(n) => n,
            None => return Ok(()),
        };

        self.push(TokenType::AttrName, name, start);
        self.skip_whitespace();

        if self.peek() == Some('=') {
            self.consume("=")?;
            self.push(TokenType::AttrEquals, "=".into(), self.start_pos());
            self.skip_whitespace();
            self.read_attr_value();
        }

        Ok(())
    }

    fn read_attr_name(&mut self) -> Option<String> {
        let mut name = String::new();

        if self.peek() == Some('@') || self.peek() == Some(':') {
            name.push(self.advance());
        }

        while !self.eof() {
            let ch = self.peek().unwrap();
            if ch.is_ascii_alphanumeric() || "-_.:".contains(ch) {
                name.push(self.advance());
            } else {
                break;
            }
        }

        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }

    fn read_attr_value(&mut self) {
        if self.eof() {
            return;
        }
        let quote = self.peek().unwrap();
        if quote != '"' && quote != '\'' {
            let start = self.start_pos();
            let mut val = String::new();
            while !self.eof() {
                let ch = self.peek().unwrap();
                if ch.is_whitespace() || ch == '>' {
                    break;
                }
                val.push(self.advance());
            }
            self.push(TokenType::AttrValue, val, start);
            return;
        }

        self.advance();
        let start = self.start_pos();
        let mut val = String::new();

        while !self.eof() {
            let ch = self.peek().unwrap();
            if ch == quote {
                self.advance();
                break;
            }
            if ch == '\\' {
                self.advance();
                if !self.eof() {
                    val.push(self.advance());
                }
                continue;
            }
            val.push(self.advance());
        }

        self.push(TokenType::AttrValue, val, start);
    }

    fn read_tag_name(&mut self) -> String {
        let mut name = String::new();
        while !self.eof() {
            let ch = self.peek().unwrap();
            if ch.is_ascii_alphanumeric() || "-_.".contains(ch) {
                name.push(self.advance());
            } else {
                break;
            }
        }
        name
    }

    fn is_tag_name_start(&self, ch: Option<char>) -> bool {
        matches!(ch, Some(c) if c.is_ascii_alphabetic() || c == '_')
    }


    fn eof(&self) -> bool {
        self.pos >= self.chars.len()
    }

    fn peek(&self) -> Option<char> {

        self.chars.get(self.pos).copied()
    }

    fn peek_at(&self, n: usize) -> Option<char> {

        self.chars.get(self.pos + n).copied()
    }

    fn looking_at(&self, s: &str) -> bool {
        let s_chars: Vec<char> = s.chars().collect();
        if self.pos + s_chars.len() > self.chars.len() {
            return false;
        }
        self.chars[self.pos..self.pos + s_chars.len()] == s_chars[..]
    }

    fn matches(&mut self, s: &str) -> bool {
        if self.looking_at(s) {
            for _ in s.chars() {
                self.advance();
            }
            true
        } else {
            false
        }
    }

    fn consume(&mut self, expected: &str) -> Result<(), CompileError> {
        for ch in expected.chars() {
            if self.chars.get(self.pos) != Some(&ch) {
                let found = self
                    .chars
                    .get(self.pos)
                    .map(|c| c.to_string())
                    .unwrap_or_default();
                return Err(CompileError::new(
                    ErrorCode::UnexpectedChar,
                    Loc::new(self.start_pos(), self.start_pos()),
                    &self.source,
                    args!(found),
                ));
            }
            self.advance();
        }
        Ok(())
    }

    fn advance(&mut self) -> char {
        let ch = self.chars[self.pos];
        self.pos += 1;
        if ch == '\n' {
            self.line += 1;
            self.col = 1;
        } else {
            self.col += 1;
        }
        ch
    }

    fn skip_whitespace(&mut self) {
        while !self.eof() && self.peek().map(|c| c.is_whitespace()).unwrap_or(false) {
            self.advance();
        }
    }

    fn start_pos(&self) -> Pos {
        Pos::new(self.line, self.col, self.pos)
    }

    fn push(&mut self, ttype: TokenType, value: String, start: Pos) {
        let loc = Loc::new(start, self.start_pos());
        self.tokens.push(Token { ttype, value, loc });
    }
}
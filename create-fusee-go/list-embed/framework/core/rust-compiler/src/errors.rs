use crate::ast::Loc;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[macro_export]
macro_rules! args {
    () => { Vec::new() };
    ($($e:expr),+ $(,)?) => { vec![$($e.to_string()),+] };
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ErrorCode {
    UnexpectedChar,
    UnterminatedString,
    UnterminatedMustache,
    UnterminatedTag,
    MalformedComment,
    UnexpectedToken,
    MissingClosingTag,
    UnexpectedClosingTag,
    InvalidDirectiveSyntax,
    InvalidForSyntax,
    DuplicateKey,
    VElseNoIf,
    EmptyExpression,
    InvalidSlotName,
    DuplicateDirective,
    ForMissingKey,
    ModelOnNonInput,
    ComponentNotRegistered,
    UnknownIdentifier,
    StaticForKey,
    UnknownNodeType,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::UnexpectedChar => "E001",
            ErrorCode::UnterminatedString => "E002",
            ErrorCode::UnterminatedMustache => "E003",
            ErrorCode::UnterminatedTag => "E004",
            ErrorCode::MalformedComment => "E005",
            ErrorCode::UnexpectedToken => "P001",
            ErrorCode::MissingClosingTag => "P002",
            ErrorCode::UnexpectedClosingTag => "P003",
            ErrorCode::InvalidDirectiveSyntax => "P004",
            ErrorCode::InvalidForSyntax => "P005",
            ErrorCode::DuplicateKey => "P006",
            ErrorCode::VElseNoIf => "P007",
            ErrorCode::EmptyExpression => "P008",
            ErrorCode::InvalidSlotName => "P009",
            ErrorCode::DuplicateDirective => "T001",
            ErrorCode::ForMissingKey => "T002",
            ErrorCode::ModelOnNonInput => "T003",
            ErrorCode::ComponentNotRegistered => "T004",
            ErrorCode::UnknownIdentifier => "S001",
            ErrorCode::StaticForKey => "S002",
            ErrorCode::UnknownNodeType => "G001",
        }
    }
}

fn template_for(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::UnexpectedChar => "Unexpected character \"{0}\"",
        ErrorCode::UnterminatedString => "Unterminated string literal",
        ErrorCode::UnterminatedMustache => "Unterminated mustache expression \"{0}\"",
        ErrorCode::UnterminatedTag => "Unterminated tag \"<{0}\"",
        ErrorCode::MalformedComment => "Malformed HTML comment",
        ErrorCode::UnexpectedToken => "Unexpected token \"{0}\", expected \"{1}\"",
        ErrorCode::MissingClosingTag => "Missing closing tag for <{0}>",
        ErrorCode::UnexpectedClosingTag => "Unexpected closing tag </{0}>",
        ErrorCode::InvalidDirectiveSyntax => "Invalid directive syntax: \"{0}\"",
        ErrorCode::InvalidForSyntax => {
            "Invalid f-for syntax: \"{0}\". Expected \"(item, index) in source\" or \"item in source\""
        }
        ErrorCode::DuplicateKey => "Duplicate attribute \"{0}\" on element <{1}>",
        ErrorCode::VElseNoIf => "f-else / f-else-if has no matching f-if",
        ErrorCode::EmptyExpression => "Expression in \"{0}\" must not be empty",
        ErrorCode::InvalidSlotName => "Invalid slot name \"{0}\"",
        ErrorCode::DuplicateDirective => "Duplicate directive \"f-{0}\" on element <{1}>",
        ErrorCode::ForMissingKey => {
            "f-for on <{0}> is missing a :key binding — add :key=\"<unique expr>\""
        }
        ErrorCode::ModelOnNonInput => {
            "f-model can only be used on <input>, <textarea> or <select>, got <{0}>"
        }
        ErrorCode::ComponentNotRegistered => {
            "Component \"{0}\" is used in the template but not registered"
        }
        ErrorCode::UnknownIdentifier => {
            "Unknown identifier \"{0}\" in expression \"{1}\" — not found in component scope"
        }
        ErrorCode::StaticForKey => {
            ":key=\"{0}\" is a static literal — keys must be unique per item (use a dynamic expression like :key=\"item.id\")"
        }
        ErrorCode::UnknownNodeType => "Unknown AST node type \"{0}\" encountered in generator",
    }
}

static PLACEHOLDER_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\{(\d+)\}").unwrap());

fn interpolate(template: &str, args: &[String]) -> String {
    PLACEHOLDER_RE
        .replace(template, |caps: &regex::Captures| {
            let idx: usize = caps[1].parse().unwrap_or(0);
            args.get(idx).map(|s| s.as_str()).unwrap_or("")
        })
        .into_owned()
}

#[derive(Debug, Clone, Serialize)]
pub struct CompileError {
    pub message: String,
    pub code: ErrorCode,
    pub loc: Loc,
    pub source: String,
}

impl CompileError {
    pub fn new(code: ErrorCode, loc: Loc, source: &str, args: impl AsRef<[String]>, ) -> Self {
        let template = template_for(code);
        let message = interpolate(template, args.as_ref());
        CompileError {
            message,
            code,
            loc,
            source: source.to_string(),
        }
    }

    pub fn format(&self, file_path: &str) -> String {
        let start = &self.loc.start;
        let header = format!("[fusée] CompileError {} at {}:{}:{}", self.code.as_str(), file_path, start.line, start.col);
        let snippet = self.build_snippet();
        if snippet.is_empty() {
            format!("{header}\n{}", self.message)
        } else {
            format!("{header}\n{}\n\n{snippet}", self.message)
        }
    }

    fn build_snippet(&self) -> String {
        if self.source.is_empty() || self.loc.start.line == 0 {
            return String::new();
        }
        let lines: Vec<&str> = self.source.split('\n').collect();
        let line_idx = self.loc.start.line - 1;
        if line_idx >= lines.len() {
            return String::new();
        }
        let col = self.loc.start.col;
        let context = 2;
        let first_line = line_idx.saturating_sub(context);
        let last_line = (line_idx + context).min(lines.len() - 1);
        let width = (last_line + 1).to_string().len();

        let mut parts: Vec<String> = Vec::new();
        for i in first_line..=last_line {
            let line_no = format!("{:width$}", i + 1, width = width);
            let prefix = if i == line_idx { "> " } else { "  " };
            parts.push(format!("{prefix}{line_no} | {}", lines[i]));
            if i == line_idx {
                let caret_pad = " ".repeat(width + 4 + col.saturating_sub(1));
                let end_col = if self.loc.end.col > 0 {
                    self.loc.end.col
                } else {
                    col
                };
                let caret_len = end_col.saturating_sub(col).max(1);
                parts.push(format!("{caret_pad}{}", "~".repeat(caret_len)));
            }
        }
        parts.join("\n")
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CompileWarning {
    pub message: String,
    pub code: ErrorCode,
    pub loc: Loc,
    pub source: String,
}

impl CompileWarning {
    pub fn new(code: ErrorCode, loc: Loc, source: &str, args: impl AsRef<[String]>) -> Self {
        let template = template_for(code);
        let message = interpolate(template, args.as_ref());
        CompileWarning {
            message,
            code,
            loc,
            source: source.to_string(),
        }
    }

    pub fn format(&self, file_path: &str) -> String {
        let start = &self.loc.start;
        format!("[fusée] Warning {} at {}:{}:{}\n{}", self.code.as_str(), file_path, start.line, start.col, self.message)
    }
}

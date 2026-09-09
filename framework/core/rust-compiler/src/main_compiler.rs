use crate::ast::Node;
use crate::errors::{CompileError, CompileWarning};
use crate::generator::{generate, GenerateOptions};
use crate::lexer::{tokenize, Token};
use crate::parser::parse;
use crate::transformer::{transform, TransformOptions};
use std::collections::HashSet;

pub struct CompileOptions {
    pub filename: String,
    pub components: HashSet<String>,
    pub scope: HashSet<String>,
    pub runtime_path: Option<String>,
    pub throw_on_warning: bool,
}

impl Default for CompileOptions {
    fn default() -> Self {
        CompileOptions {
            filename: "<template>".to_string(),
            components: HashSet::new(),
            scope: HashSet::new(),
            runtime_path: None,
            throw_on_warning: false,
        }
    }
}

pub struct CompileResult {
    pub code: String,
    pub ast: Node,
    pub tokens: Vec<Token>,
    pub warnings: Vec<CompileWarning>,
}

pub fn compile(source: &str, options: CompileOptions) -> Result<CompileResult, CompileError> {
    let tokens = tokenize(source).map_err(|e| rethrow(e, &options.filename))?;

    let ast = parse(tokens.clone(), source, &options.components)
        .map_err(|e| rethrow(e, &options.filename))?;

    let transform_opts = TransformOptions {
        components: options.components.clone(),
        source: source.to_string(),
        scope: options.scope.clone(),
    };
    let (ast, warnings) = transform(ast, transform_opts);

    if options.throw_on_warning {
        if let Some(w) = warnings.first() {
            return Err(CompileError::new(w.code, w.loc.clone(), source, &[]));
        }
    }

    let root = match &ast {
        Node::Root(r) => r,
        _ => unreachable!("parse() always produces a Root node"),
    };

    let code = generate(
        root,
        GenerateOptions {
            source: source.to_string(),
            runtime_path: options.runtime_path.clone(),
        },
    )
        .map_err(|e| rethrow(e, &options.filename))?;

    Ok(CompileResult {
        code,
        ast,
        tokens,
        warnings,
    })
}

pub fn parse_only(source: &str, components: &HashSet<String>) -> Result<(Node, Vec<Token>), CompileError> {
    let tokens = tokenize(source)?;
    let ast = parse(tokens.clone(), source, components)?;
    Ok((ast, tokens))
}

pub fn transform_only(ast: Node, components: HashSet<String>, source: String, scope: HashSet<String>) -> (Node, Vec<CompileWarning>) {
    transform(
        ast,
        TransformOptions {
            components,
            source,
            scope,
        },
    )
}

fn rethrow(err: CompileError, filename: &str) -> CompileError {
    let formatted = err.format(filename);
    CompileError {
        message: formatted,
        ..err
    }
}
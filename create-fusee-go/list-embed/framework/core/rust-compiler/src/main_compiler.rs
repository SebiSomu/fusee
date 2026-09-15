use crate::ast::Node;
use crate::errors::{CompileError, CompileWarning};
use crate::generator::{generate, GenerateOptions};
use crate::lexer::{tokenize, Token};
use crate::parser::parse;
use crate::ssr_generator::{generate_ssr, SSRGenerateOptions};
use crate::transformer::{transform, TransformOptions};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompileTarget {
    Client,
    SSR,
    Both,
}

impl Default for CompileTarget {
    fn default() -> Self {
        CompileTarget::Client
    }
}

pub struct CompileOptions {
    pub filename: String,
    pub components: HashSet<String>,
    pub scope: HashSet<String>,
    pub runtime_path: Option<String>,
    pub ssr_runtime_path: Option<String>,
    pub throw_on_warning: bool,
    pub target: CompileTarget,
}

impl Default for CompileOptions {
    fn default() -> Self {
        CompileOptions {
            filename: "<template>".to_string(),
            components: HashSet::new(),
            scope: HashSet::new(),
            runtime_path: None,
            ssr_runtime_path: None,
            throw_on_warning: false,
            target: CompileTarget::Client,
        }
    }
}

pub struct CompileResult {
    pub code: String,
    pub ssr_code: Option<String>,
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

    let code: String;
    let mut ssr_code: Option<String> = None;

    match options.target {
        CompileTarget::Client => {
            code = generate(
                root,
                GenerateOptions {
                    source: source.to_string(),
                    runtime_path: options.runtime_path.clone(),
                },
            )
            .map_err(|e| rethrow(e, &options.filename))?;
        }
        CompileTarget::SSR => {
            let ssr = generate_ssr(
                root,
                SSRGenerateOptions {
                    source: source.to_string(),
                    runtime_path: options
                        .ssr_runtime_path
                        .clone()
                        .or_else(|| options.runtime_path.clone()),
                },
            )
            .map_err(|e| rethrow(e, &options.filename))?;
            code = ssr.clone();
            ssr_code = Some(ssr);
        }
        CompileTarget::Both => {
            code = generate(
                root,
                GenerateOptions {
                    source: source.to_string(),
                    runtime_path: options.runtime_path.clone(),
                },
            )
            .map_err(|e| rethrow(e, &options.filename))?;

            let ssr = generate_ssr(
                root,
                SSRGenerateOptions {
                    source: source.to_string(),
                    runtime_path: options
                        .ssr_runtime_path
                        .clone()
                        .or_else(|| options.runtime_path.clone()),
                },
            )
            .map_err(|e| rethrow(e, &options.filename))?;
            ssr_code = Some(ssr);
        }
    }

    Ok(CompileResult {
        code,
        ssr_code,
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

use std::collections::HashSet;
use std::env;
use std::fs;
use std::process;

use fusee_compiler::ast::Node;
use fusee_compiler::main_compiler::{parse_only, transform_only};

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: fusee-ast <template-file> [output-file]");
        process::exit(1);
    }

    let input_path = &args[1];
    let source = match fs::read_to_string(input_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("fusee-ast: failed to read {}: {}", input_path, e);
            process::exit(1);
        }
    };

    // TODO: if your build pipeline tracks a real component registry or
    // scope allowlist (the same `components`/`scope` options
    // main_compiler::compile() already accepts), populate these from
    // it instead of leaving them empty. An empty `components` set just
    // means every capitalized tag is still treated as a Component node
    // (parser.rs's own `/^[A-Z]/` fallback) but produces a
    // ComponentNotRegistered warning for each one, printed below and
    // otherwise harmless — the AST is still emitted.
    let components: HashSet<String> = HashSet::new();
    let scope: HashSet<String> = HashSet::new();

    let (ast, _tokens) = match parse_only(&source, &components) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{}", e.format(input_path));
            process::exit(1);
        }
    };

    let (ast, warnings): (Node, _) = transform_only(ast, components, source.clone(), scope);
    for w in &warnings {
        eprintln!("{}", w.format(input_path));
    }

    let json = match serde_json::to_string(&ast) {
        Ok(j) => j,
        Err(e) => {
            eprintln!("fusee-ast: failed to serialize AST: {}", e);
            process::exit(1);
        }
    };

    match args.get(2) {
        Some(output_path) => {
            if let Err(e) = fs::write(output_path, &json) {
                eprintln!("fusee-ast: failed to write {}: {}", output_path, e);
                process::exit(1);
            }
        }
        None => println!("{}", json),
    }
}
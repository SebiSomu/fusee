#![allow(dead_code)]

mod utils;
mod errors;
mod ast;
mod generator;
mod lexer;
mod main_compiler;
mod parser;
mod transformer;

use serde::Deserialize;
use wasm_bindgen::prelude::*;
use crate::main_compiler::CompileOptions;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
extern {
    fn alert(s: &str);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RustCompileOptions {
    #[serde(default)]
    filename: Option<String>,
    #[serde(default)]
    components: Option<Vec<String>>,
    #[serde(default)]
    scope: Option<Vec<String>>,
    #[serde(default)]
    runtime_path: Option<String>,
    #[serde(default)]
    throw_on_warning: Option<bool>,
}

#[wasm_bindgen]
pub fn compile(source: &str, options_json: &str) -> Result<String, JsValue> {
    let opts: RustCompileOptions = serde_json::from_str(options_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid compiler options: {e}")))?;
    let filename = opts.filename.clone().unwrap_or_else(|| "<template>".to_string());

    let compile_opts = CompileOptions {
        filename: filename.clone(),
        components: opts.components.unwrap_or_default().into_iter().collect(),
        scope: opts.scope.unwrap_or_default().into_iter().collect(),
        runtime_path: opts.runtime_path,
        throw_on_warning: opts.throw_on_warning.unwrap_or(false),
    };

    match main_compiler::compile(source, compile_opts) {
        Ok(r) => {
            let out = serde_json::json!({
                "code": r.code,
                "ast": r.ast,
                "tokens": r.tokens,
                "warnings": r.warnings,
            });
            serde_json::to_string(&out).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Err(e) => Err(JsValue::from_str(&e.format(&filename))),
    }
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, rust-compiler!");
}

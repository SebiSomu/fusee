---
name: fusee-framework
description: Guide for agents working on the Fusée framework — a custom reactive SSR framework with a JS/Rust dual-compiler and a JS/Go dual-server-engine. Read this before adding features, rewriting existing ones, or touching anything under compiler/, framework/, runtime/, or the Go server engine.
---

# Fusée Framework — Agent Guide

Fusée is a from-scratch reactive SSR framework: a custom template DSL
(`f-if`/`f-for`/`f-bind`/`{{ }}`), a fine-grained signal-based reactive
core, and a five-layer server engine (request isolation → routing →
streaming SSR → dehydration → runtime adapters). It currently exists as
**two parallel implementations that must be tracked deliberately, not
assumed to be in sync**:

- A **JavaScript** implementation (compiler + reactive core + full
  five-layer server), which is what actually runs today.
- A **Go server engine** (`fusee-go/`) consuming an AST compiled by a
  **Rust** compiler, intended to eventually replace the JS server for
  SSR — described by the project owner as "the new SSR module." As of
  this writing it is **built and tested but not yet the thing actually
  serving traffic** — see "Current vs. Legacy" below before assuming
  either side is authoritative.

This file exists so an agent can find its way through this without
re-deriving the architecture (or re-discovering the same bugs) from
scratch. Read the relevant section before touching a given part of the
tree.

---

## 1. Map of the codebase

### 1a. Compiler(s)

Two compiler frontends, both producing the **same AST shape** in
principle, but only the Rust one has a path that skips codegen
entirely:

|               | Location                                                                                                                     | Targets                                                                                                                                                                                           | Notes                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JS compiler   | `compiler/*.js` (`lexer.js`, `parser.js`, `transformer.js`, `generator.js` [client target], `ssr-generator.js` [SSR target]) | Emits JS source text (`render()` for client, `renderSSR()` for server)                                                                                                                            | `generator.js`'s `_genIf` (and Rust's `generator.rs`) renders the branch element's own tag (`[() => cond, () => [node]]`), in sync with `ssr-generator.js` / `ssr_generator.rs`. |
| Rust compiler | `parser.rs`, `transformer.rs`, `generator.rs`, `ssr_generator.rs`, `ast.rs`, `main_compiler.rs`, `lib.rs`                    | (a) WASM via `wasm-bindgen`, emits JS source text, same as the JS compiler's SSR target; (b) a native binary `fusee-ast` (see below) that skips codegen and emits the **transformed AST as JSON** | `ssr_generator.rs`'s `emit_if` is correct (renders the whole branch node) — this is the reference to check the JS side against, not the other way around.                                   |

`fusee-ast` (native Rust binary, lives in a `src/bin/` target, not the
WASM lib target) calls the already-public `parse_only()` +
`transform_only()` from `main_compiler.rs` and serializes the resulting
`Node` via `serde_json`. `mod ast;` / `mod main_compiler;` / `mod errors;`
in `lib.rs` are `pub mod`.

The JSON AST it produces is the interchange format the Go server
consumes (see 1c). Field names are the Rust struct field names verbatim
(snake_case — no `rename_all` attribute anywhere in `ast.rs`), and
`Node`/`Prop` are internally tagged (`#[serde(tag = "type")]`): a
variant's fields are flattened into the same JSON object as `"type"`,
not nested under a variant key.

### 1b. JS runtime + server (currently what actually serves traffic)

```
framework/core/
  signal.js          — REAL fine-grained reactive core (owner trees, dependency
                        tracking, computed(), watch(), resource() with Suspense-
                        style throw). Patched to call resolveSignalValue() at
                        the top of signal() for positional dehydration replay.
  signal-scope.js     — positional signal-state recording/replay (withSignalScope,
                        resolveSignalValue). ALS-backed (see async-context.js),
                        NOT a manual stack — a manual stack was tried and broken
                        by async setup()/concurrent sibling scopes; see §3.
  async-context.js    — AsyncLocalStorage accessors: getInFlightStore(),
                        getResourceRegistry(), getSignalRegistry(), getSignalFrame(),
                        runInSignalScope(), isSSRContext(). Registers TWO ALS
                        instances (request-level + signal-scope-level) — see §3.
  hydration.js        — resource-cache hydration (Step 2) + renderDehydrationScript()/
                        hydrateFromWindow()/hydrateApp()/hydrateAnchors() (Step 4).
                        hydrateApp() enforces hydrateFromWindow() BEFORE
                        hydrateAnchors() — don't call them separately unless you
                        have a reason to.
  dom-anchors.js      — pure DOM walker for the anchor-comment scheme (see §2).
                        Matches bindings[i] to the i-th anchor in DOCUMENT ORDER —
                        never parses the anchor's embedded numeric id. Any anchor-
                        numbering scheme change is safe as long as this stays true.
  resource.js         — defineResource/useResource: request-scoped dedup via
                        inFlightMaps.byKey. NOTE: signal.js's OWN resource()
                        (in the real file) is a separate, more complete
                        implementation with its own hydration path via
                        _registerResourceCache/getHydratedEntries — these two
                        need reconciling if both are in active use; don't assume
                        they're the same thing.
  component.js, store.js, event-delegation.js, evaluator.js, actions.js — component
                        lifecycle, Pinia-like stores, DOM event delegation, mustache
                        evaluation, client-side action stubs.

framework/server/
  index.js, pipeline.js     — Layer 1: createRequestContext/withRequestContext,
                               createRequestPipeline (the actual Node listener).
  static-assets.js, route-matcher.js, load-helpers.js, dispatcher.js, actions.server.js
                             — Layer 2: static bypass -> actions interceptor ->
                               route match + load(). NOT wired to a real
                               file-router.js scanner — route tables are supplied
                               by hand or by whatever builds them.
  stream.js, render.js       — Layer 3: createSSRStreamResponse (shell-first flush +
                               out-of-order suspense boundaries), renderPageToStream
                               (composes stream.js + signal-scope + dehydration tail).
  hydration.js (additions)   — Layer 4: see above.
  node-adapter.js, fetch-adapter.js — Layer 5: pipeToNodeResponse, createFetchHandler/
                               createBunHandler (same function, aliased).

runtime/ssr.js               — renderComponentSSR wraps componentDef.setup() in
                               withSignalScope(scopeId), where scopeId IS the
                               anchor id ssr-generator.js assigned that component's
                               boundary comment — Step 1 and Step 4 share one id
                               scheme by construction, not by coincidence.
```

### 1c. Go server engine (`fusee-go/`) — parallel implementation, not yet load-bearing

```
reqcontext/    — Layer 1: context.Context-based request isolation (NOT ALS —
                 Go has none, deliberately; see §4). Middleware() allocates BOTH
                 a RequestContext AND a reactive.Registry together — this pairing
                 is load-bearing, see §3.
router/        — Layer 2 (matching only — no filesystem scanner).
staticassets/, actions/, loadhelpers/, dispatcher/
                 — Layer 2, composed: static bypass -> actions interceptor ->
                   route + load(). loadhelpers uses returned `error` values
                   (RouteRedirect/RouteHTTPError), NOT JS-style throw — see §4.
reactive/      — Positional signal-scope ONLY (Signal[T] is a value cell with
                 Get/Set, NOT a full reactive system — Go can't replicate
                 count()/count(5) call-through ergonomics; no operator overloading,
                 no proxies). WithScope is ALS-analog via a SECOND context value,
                 not a stack — ported the exact fix JS needed, this time built in
                 from the start.
evalexpr/      — Small, safe expression interpreter (identifier/member/index
                 access, arithmetic, comparison, logical ops). Exists because Go
                 has no `new Function()` — the Rust compiler's SSR codegen target
                 (JS source text) is USELESS to Go without a JS engine; this
                 interpreter is what makes AOT-compiled JSON AST + Go rendering
                 possible at all. No code-execution path exists here — stronger
                 safety property than JS's new Function().
rustast/       — Go types mirroring ast.rs exactly, custom UnmarshalJSON for the
                 tagged unions. Verified against REAL fusee-ast output
                 (testdata/*.json) — do not hand-edit these fixtures; regenerate
                 via `cargo run --bin fusee-ast -- <template> <output.json>`.
render/        — Walks the AST, evaluates expressions via evalexpr, produces HTML
                 with the SAME anchor-comment scheme as ssr-generator.js/
                 ssr_generator.rs. Anchor ID numbering is DYNAMIC (per-actual-
                 render), not STATIC (per-AST-position) like the Rust/JS codegen —
                 safe today because dom-anchors.js/hydration.js never read the
                 embedded number, but re-check this if that ever changes (§2).
hydration/     — RenderDehydrationScript/BuildFromContext. Go's json.Marshal
                 HTML-escapes by default (JS's does NOT) — a ported "escape
                 </script>" step here would be dead code; don't add one back.
ssr/           — Shell-first flush + out-of-order suspense boundaries over
                 http.ResponseWriter/http.Flusher directly (no WHATWG
                 ReadableStream in Go — doesn't need one; http.ResponseWriter
                 already is the universal Go interface, so there's no Layer 5
                 gap to fill on the Go side at all).
integration/   — Cross-package tests that CANNOT live inside reqcontext (would
                 create an import cycle with hydration, which imports reqcontext).
                 This is where the real end-to-end pipeline test lives.
```

Build step required for the Go path to render anything real: `fusee-ast`
compiles a template to `.ast.json`, ahead of time (confirmed: **not**
per-request/live). The Go server loads these files and renders via
`render.Render(astNode, scope)`.

---

## 2. The anchor-comment scheme (cross-language, load-bearing)

`<!--f-bind:N-->…<!--/f-bind:N-->`, `<!--f-if:N-->`, `<!--f-for:N-->` /
`<!--f-for-item:N:key-->`, `<!--f-component:name:N-->`, `<!--f-slot:N-->`,
and `data-f-id="N"` on elements with reactive attrs/events. This scheme
is **shared across every implementation** — JS codegen, Rust codegen,
and the Go interpreter all emit it, and `dom-anchors.js`/`hydration.js`
(the only hydration consumer that exists) walk it.

**The one thing every implementation must keep true, because
`hydrateAnchors` depends on it**: bindings are matched to anchors by
**array index in document-traversal order**, never by parsing the
embedded `N`. This is what let the Go renderer use a completely
different (dynamic vs. static) numbering scheme without breaking
compatibility. If you ever build `f-for`/`f-component` _reactive_
hydration (currently unimplemented on every side — JS and Go both),
re-verify this assumption before relying on it further; it was true by
accident of `hydrateAnchors`'s specific implementation, not by a
documented contract.

---

## 3. Integration bugs already found — don't reintroduce this class of bug

These are real bugs this project already hit, each because a new piece
of per-request or per-scope state was added **without** attaching it at
the exact same place/call as the state it needs to travel alongside:

1. **JS**: `signalScope.stack` was a plain array, popped in a `finally`
   after an `async` function. `finally` fires the instant the function
   hits its first `await`, not when it truly completes — any
   `signal()` call after that point ran with the wrong scope. Fixed by
   using a **second, dedicated `AsyncLocalStorage`** for "current scope
   frame," separate from the request-level one. **Rule: any new
   "currently active X" concept that must survive `await` and
   concurrent siblings needs its own ALS (or, in Go, its own
   `context.Context` value threaded through function params) — never a
   mutable stack.**

2. **Go**: `reqcontext.RequestContext` had a `SignalRegistry` field that
   duplicated `reactive.Registry`'s job but was never actually
   connected to it — `reqcontext.Middleware` never called
   `reactive.WithRegistry`. Every test that exercised `reactive`
   happened to call `WithRegistry` manually, masking the gap. **Rule:
   whenever a new per-request store is introduced, it must be attached
   in the exact same function that creates the request's context/scope
   (`Middleware`/`createRequestPipeline`), and there must be at least
   one test that goes THROUGH that entry point — not a shortcut that
   bypasses it — or the gap won't be caught.**

3. Component slot content (`n.Component.Slots` in the Go renderer)
   wasn't being copied into the child's scope under `_slots` — caught
   immediately by the first component test that actually rendered slot
   content, not by any earlier "does it parse" test. **Rule: a feature
   that touches data-passing between a parent and a nested/child
   context needs a test that asserts on the CHILD's output, not just
   that the parent constructed the right intermediate object.**

**When adding a feature, ask explicitly: does this need to travel
somewhere via an ambient/context mechanism? If yes — wire it at the
same call site as everything else already living in that context, and
write the test through the real entry point (`createRequestPipeline` /
`reqcontext.Middleware` / equivalent), not a shortcut.** This is
directly the "make sure every feature is coupled correctly" mandate
below.

---

## 4. Known cross-language traps

- **Go's `json.Marshal` HTML-escapes `<`/`>`/`&` by default.** JS's
  `JSON.stringify` does not. A manual `</script>` escape step is
  necessary in JS (`hydration.js`'s `renderDehydrationScript`), and is
  **dead code** in Go (`hydration.RenderDehydrationScript` — verified,
  removed). Don't port an escape step between these languages without
  checking whether the target language already does it.
- **HTTP/2 rejects a `Transfer-Encoding` header.** `node-adapter.js`'s
  `pipeToNodeResponse` had to be checked against a real
  `http2.createServer()`, not just a mock `res` — this is exactly the
  kind of thing mocks silently paper over.
- **A raw Node `http.ServerResponse` has no `.status()`/`.json()`**
  (Express-style). `actions.server.js`'s original `_sendJson` only
  handled that shape or a Fetch `Response`-returning shape — neither
  writes to a plain Node `res`. Fixed by adding a third branch. Check
  this whenever wiring JS server code across different host
  environments (Node vs. Express vs. edge Response-returning).
- **Rust's `#[serde(tag = "type")]` on newtype-variant enums flattens
  the wrapped struct's fields into the tag's object** — not
  `{"Element": {...}}`, but `{"type":"Element", ...fields}`. Custom
  `UnmarshalJSON` in Go (`rustast.go`) exploits exactly this: peek
  `"type"`, then unmarshal the whole payload into the matching struct
  (unknown fields like `"type"` itself are silently ignored by
  `encoding/json`).
- **Go has no `new Function()`/`eval`.** Any codegen approach that
  relies on generating source text to be executed later (as both the
  JS and Rust SSR codegen targets do) is a dead end for Go specifically
  — Go needs either a real interpreter over structured data
  (`evalexpr`+`render`, what was built) or an embedded JS engine (not
  attempted — real compatibility risk against modern JS syntax in
  anything short of a full V8/Node embed).
- **Go's idiomatic error handling is not JS's throw-based control
  flow.** `load-helpers.js`'s `redirect()`/`httpError()` throw; Go's
  `loadhelpers.Redirect()`/`HTTPError()` **return** a typed `error`
  instead. Don't reach for `panic`/`recover` to mimic JS throw
  ergonomics in Go — it works mechanically but fights how Go code is
  normally read.

---

## 5. Directives for agents working in this codebase

### 5a. When a new feature is added

- **Add TypeScript types immediately, in the same change.**
- **Add tests in the same change, not after.** Test file location
  mirrors source location: a file at `framework/server/foo.js` gets
  `test/foo.test.js`. Prefer real fixtures over hand-constructed mocks
  wherever feasible — this project's test suite repeatedly caught real
  bugs specifically because it used real temp files (`static-assets`),
  a real HTTP/2 server (`node-adapter`), and real compiler output
  (`rustast`/`render` — never hand-write AST JSON when
  `fusee-ast`/`cargo run` can generate real fixtures instead). A mock
  that's wrong looks identical to a mock that's right; a real
  fixture/server does not have that failure mode.
- For Go: run `go vet ./...` and `go test ./... -race` before
  considering anything involving goroutines, shared state, or
  `context.Context` done. The race detector is the actual authority on
  concurrency claims here, not code review or reasoning about it.

### 5b. Make sure every feature is coupled correctly to the framework

- A feature is not done when it passes its own unit tests in
  isolation — it's done when there's a test that exercises it **through
  the real entry point** (`createRequestPipeline`, `reqcontext.Middleware`,
  `withSignalScope` wrapping an actual `setup()` call, etc.), per §3.
- If the feature introduces new per-request or per-scope state, verify
  it's attached at the exact same call site as the existing request/scope
  setup — not a parallel, uncoordinated context key. Grep for how the
  most similar existing piece of state is wired (e.g. `inFlightMaps`,
  `resourceRegistry`, `reactive.Registry`) and follow that pattern
  exactly rather than inventing a new one.
- If the feature spans the JS/Rust or JS/Go boundary, check §4 for
  known traps before assuming a pattern that works in one language
  works identically in the other.

### 5c. When an existing feature is rewritten, make sure the new one runs instead of the legacy one

This project has **two live implementations of the same server engine**
(JS and Go) and **two live compiler frontends** (JS and Rust) at once.
That's a deliberate, temporary state — not a permanent one — and it's
exactly the situation where an agent can wire a fix into the version
that isn't actually serving traffic and ship nothing.

- **Before rewriting or fixing anything, determine which
  implementation is currently authoritative** for that layer. As of
  this writing:

  | Layer                 | Currently authoritative                                  | Status of the alternative                                                                                                                                            |
  | --------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Compiler              | JS (`compiler/*.js`)                                     | Rust: `fusee-ast` binary works and is verified; **not yet wired as the build step actually used** — confirm before assuming Rust output reaches production templates |
  | L1 Request Pipeline   | JS (`framework/server/pipeline.js`)                      | Go (`reqcontext`) built, tested, not yet serving                                                                                                                     |
  | L2 Routing/Dispatcher | JS (`dispatcher.js` et al.)                              | Go (`dispatcher` et al.) built, tested, not yet serving                                                                                                              |
  | L3 SSR Renderer       | JS (`ssr-generator.js` + `runtime/ssr.js` + `render.js`) | Go (`render`+`rustast`) built, tested, **requires the Rust `fusee-ast` build step**, not yet serving                                                                 |
  | L4 Dehydration        | JS (`hydration.js`)                                      | Go (`hydration` package) wire-compatible, not yet serving                                                                                                            |
  | L5 Adapters           | JS (`node-adapter.js`/`fetch-adapter.js`)                | N/A in Go by design (`http.ResponseWriter` already universal)                                                                                                        |

  **This table will go stale. Update it in the same change that flips
  which implementation actually serves traffic** — don't leave the next
  agent to rediscover this by reading code.

- When a rewrite is finished and verified, the OLD implementation must
  be either **deleted** or **explicitly marked deprecated with a
  pointer to its replacement** (a comment at the top of the file is the
  minimum bar) — never left silently in place as an equally-plausible
  code path. A dispatcher, entry point, or build config that could
  still reach the legacy path after a rewrite is considered incomplete,
  even if the new path also works.
- If you're not sure whether something is legacy or current, that's a
  signal to update this file's table above once you find out — not to
  guess.

---

## 6. Testing philosophy established in this project (keep following it)

- Prefer a real file, real server, real subprocess, or real compiler
  invocation over a mock, whenever the sandbox/CI environment allows
  it. Every mock in this codebase's history that turned out wrong
  produced a passing-but-meaningless test; every real fixture that
  turned out wrong produced a real bug report.
- When a test produces a confusing, hard-to-explain failure (or a
  reproducible-but-weird runner artifact), isolate it with the smallest
  possible reproduction **outside** the framework/test runner before
  concluding it's a real bug in the code under test — this project hit
  one Node/Vitest webstreams interaction that looked like a real
  concurrency bug and turned out to be neither (verified via a bare
  `node script.mjs` with zero framework code involved).
- Don't suppress a confusing test-runner artifact with a broad,
  project-wide flag (e.g. Vitest's `dangerouslyIgnoreUnhandledErrors`)
  just to get a clean run — a narrow, well-documented exception is
  preferable to hiding a whole class of future signal.

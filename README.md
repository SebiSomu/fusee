<p align="center">
  <img src="./fusee-logo.svg" alt="Fusée Framework Logo" width="300" />
</p>

<h1 align="center">Fusée Framework</h1>

<p align="center">
  <strong>v2.7.3 — Signals-First JS Framework | Atomic Reactivity | Rust Compiler | Go Toolchain</strong>
</p>

<br />

Fusée is a custom, high-performance fine-grained reactive JavaScript framework built for speed and simplicity. It features a recursive, non-greedy Rust compiler, a signals-based reactivity engine, fully integrated Dependency Injection support, file-based routing, and a fully self-contained Go CLI for instant application scaffolding — with an optional Go SSR engine for server-side rendering.

---

## What's New in 2.7.3

- Added **Web Components**: `defineElement()` turns a fusée component into a native custom
  element with reactive props synced to attributes, shadow DOM, scoped `css` styles, native
  slots and DOM events. `toCustomElement()` converts existing components.
- `provide()`/`inject()` work across custom elements, and interoperate with `@lit/context`
  through the Context Protocol.
- Server-side rendering of elements as declarative shadow DOM, in Node
  (`renderElementsSSR()`) and in the Go SSR engine (elements are read from `app/elements`
  by `npm run manifest`).
- Added `fusee generate element <tag-name>`.
- **Smaller bundles:** importing `fusee-framework` no longer copies the API onto `globalThis`,
  so bundlers drop the modules an app doesn't use (a counter app went from 23.6 KB to
  11.0 KB gzip). The auto-import preset now covers every export.
  **Breaking:** code that calls the API with neither imports nor auto-imports (e.g. a plain
  `<script>`) must add `import 'fusee-framework/globals'`.
- Fixed: delegated events (`@click`) inside shadow roots; the first `:binding` on a tag being
  ignored in string templates; content right after an `f-if` element being dropped by the
  compiler; manifest pages in the Go dev server not receiving their `Load` data;
  `fusee-framework` and `fusee-framework/server` failing to import in plain Node.
- Fixed compiled templates (`.fusee` files and JSX `render()`): nested elements were flattened
  into the component's container; `f-for` lists and `f-if` branches that were already non-empty
  or true at mount rendered nothing; swapping two keyed rows had no effect; loops without
  `:key` rendered only their last item.
- `f-for` items now use the same syntax on the client, in SSR and in the Go engine:
  `{{ row.id }}`. Compiled client templates used to need `{{ row().id }}`, which still works.
- Added `defineCompiledComponent()` for components with a compiled `render`: it leaves the
  runtime template compiler out of the bundle (a counter component: 11.9 KB → 6.4 KB gzip).
  JSX components use it automatically.
- Fixed the JSX runtime: it failed to load (wrong import path), and text and `{expression}`
  children were not rendered.
- Fixed dependency tracking in f-for for h.js
- Fixed shipping of intended libraries into separated dedicated libraries in npm (like router, di, store, etc.).
  `fusee-framework` is now the core only (reactivity, components, elements, templates,
  `createApp`). The rest has its own entry point:

  | Entry                     | Exports                                                              |
  | ------------------------- | -------------------------------------------------------------------- |
  | `fusee-framework/router`  | `createRouter`, `navigate`, `generateRoutes`, guards, route signals  |
  | `fusee-framework/store`   | `defineStore`, `storeToRefs`, `useNestedStore`, store plugins        |
  | `fusee-framework/di`      | `InjectionToken`, `provideGlobal`, `EnvironmentInjector`             |
  | `fusee-framework/actions` | `defineAction`, `createActionProxy`, `useAction` (client side)       |
  | `fusee-framework/plugins` | `defineFuseePlugin` and the other plugin descriptors                 |
  | `fusee-framework/server`  | Node: `handleActionRequest`, SSR helpers, `generateManifest`         |

  **Breaking:** import these from their entry, e.g.
  `import { createRouter } from 'fusee-framework/router'`. Auto-imports and new projects from
  `fusee init` already do. `provide()` / `inject()` stay in the core.
  FREL, Comet and the Go SSR engine are no longer in the npm package: install them with
  `fusee add frel | comet | server`.

## Quick Start

The fastest way to get started with Fusée is via the **Go-Powered CLI**:

```bash
# Install globally from npm
npm install -g fusee-framework

# Scaffold a new project (JS or TS)
fusee init my-app

# Or use the binary directly
create-fusee-app init my-app
```

Follow the interactive prompt to choose **JavaScript** or **TypeScript**, then:

```bash
cd my-app && npm install

# Start in SPA mode (no Go required)
npm run dev:spa     # → Vite dev server on port 5173
```

---

## CLI Commands

The `fusee` CLI is a single self-contained binary (no Node.js runtime needed) compiled for all platforms.

### `fusee init <name>`

Scaffold a new Fusée project. Includes the full framework core, file-based routing, Vite config, and sample pages.

```bash
fusee init my-app           # JavaScript template
fusee init my-app --ts      # TypeScript template
```

### `fusee generate <type> <name>`

Generate boilerplate for common resource types:

```bash
fusee generate page    dashboard   # → app/pages/dashboard.js
fusee generate component Button    # → app/components/Button.js
fusee generate store   auth        # → app/stores/auth.js
fusee generate composable useFetch # → app/composables/useFetch.js
fusee generate action  sendEmail   # → app/actions/sendEmail.js
fusee generate element fu-counter  # → app/elements/fu-counter.js (custom element; needs a hyphen)
```

Aliases: `fusee g page dashboard`, `fusee g el fu-counter`

### `fusee add server`

Install the optional **Go SSR Engine** into an existing project:

```bash
cd my-app
fusee add server        # → installs framework/engine-go
npm run dev             # → generate manifest + start Go server on port 3000
```

Aliases: `fusee add go-server`, `fusee add engine-go`

### `fusee add frel`

Install the optional **FREL (Fusée Reactive Expression Language)** module into an existing project:

```bash
cd my-app
fusee add frel        # → installs framework/frel
```

FREL adds support for LINQ-style reactive queries over arrays, iterables, and signals, as well as client-side server function execution.

---

## Example Component

```javascript
// default template

export const Counter = defineComponent({
  setup() {
    const count = signal(0);
    const double = computed(() => count() * 2);

    return {
      count,
      double,
      inc: () => count(count() + 1),
      template: `
        <div class="card">
          <h2>Count: {{ count }}</h2>
          <button @click.debounce.300ms="inc">Increment</button>
          <p f-if="count() > 0">Double: <strong>{{ double }}</strong></p>
        </div>
      `,
    };
  },
});
```

```jsx
// jsx template

export const Counter = defineComponent({
  setup() {
    const count = signal(0);
    const double = computed(() => count() * 2);

    return {
      count,
      double,
      inc: () => count(count() + 1),
      render() {
        return (
          <div className="card">
            <h2>Count: {count()}</h2>
            <button onClick={this.inc}>Increment</button>
            {count() > 0 && (
              <p>
                Double: <strong>{double()}</strong>
              </p>
            )}
          </div>
        );
      },
    };
  },
});
```

---

## Web Components

`defineElement()` registers a native custom element backed by a fusée component. It works in
plain HTML, inside fusée templates and JSX, and in any other framework.

```javascript
import { defineElement, css } from 'fusee-framework'

defineElement('fu-counter', {
  props: {
    count: { type: Number, default: 0, reflect: true },   // <fu-counter count="3">
    items: { type: Array, default: () => [], attribute: false }, // property only
  },
  styles: css`:host { display: block } button { padding: ${8}px }`,
  shadow: 'open', // 'open' (default) | 'closed' | false (light DOM)
  setup(props, { host, emit }) {
    return {
      props,
      inc: () => { host.count = props.count + 1; emit('change', host.count) },
      template: `<button @click="inc">{{ props.count }}</button><slot></slot>`,
    }
  },
})
```

- **Props** are signals exposed as element properties. Attributes are converted by type
  (`String`, `Number`, `Boolean`, JSON for `Array`/`Object`), use kebab-case names
  (`userName` ↔ `user-name`), and can be customized with `attribute` and `converter`.
  `reflect: true` writes changes back to the attribute. Updates are fine-grained: setting
  `el.count = 5` only touches the nodes that read it.
- **Binding from fusée:** `:items="list"` in string templates and `items={list()}` in JSX
  set rich values as properties, so arrays and objects arrive intact.
- **Events:** `emit(name, detail)` dispatches a bubbling, composed `CustomEvent` from the
  host. Listen with `@change="onChange"` or `addEventListener`.
- **Styles:** `css` builds one stylesheet shared by every instance. Interpolations must be
  `css` results or numbers; use `unsafeCSS()` for trusted strings.
- **Lifecycle:** `setup` runs on first connect, `onMount`/`onUnmount` work as usual, and
  moving an element in the DOM keeps its state.
- **DI:** `provide()`/`inject()` reach across element boundaries. Fusée also speaks the
  community Context Protocol, so it can consume `@lit/context` providers and serve Lit
  consumers.
- **Existing components:** `toCustomElement(Counter, 'fu-counter')` registers a
  `defineComponent()` component as an element.

Elements in `app/elements/` (created by `fusee generate element <tag-name>`) are registered by
`app/main` in new projects. For projects created before 2.7, add this line once to `app/main`:

```javascript
import.meta.glob('./elements/**/*.{js,ts}', { eager: true })
```

### Server-side rendering

Elements render on the server as declarative shadow DOM (`<template shadowrootmode>`), so
their content and styles are visible before JavaScript loads. On upgrade, the element takes
over that shadow root.

- **Node:** pass any HTML (a compiled page, a static file) through `renderElementsSSR()`:

  ```javascript
  import { renderElementsSSR } from 'fusee-framework/server'

  const html = await renderElementsSSR(pageHtml)
  ```

- **Go engine:** `npm run manifest` also imports the modules in `app/elements/` and adds each
  element's props, styles and template to `.fusee/manifest.json`. The Go server renders them
  automatically. Go cannot run JS `setup()`, so templates see props directly and as
  `props.x`. For computed state, attach a Go `Setup` function:

  ```go
  elements := manifest.ElementRegistry()
  elements["fu-greet"].Setup = func(props evalexpr.Scope) (evalexpr.Scope, error) {
      return evalexpr.Scope{"greeting": "Hello, " + props["name"].(string)}, nil
  }
  html, err := engine.RenderWithElements(page.AST, scope, nil, elements)
  ```

Element modules must be importable in plain Node for SSR (no CSS or browser-only imports at
module level). Light-DOM elements (`shadow: false`) render on the client only, and slot
fallback content appears once the element upgrades.

---

## Development Modes

| Mode                | Command            | Port | Requires Go |
| ------------------- | ------------------ | ---- | ----------- |
| SPA (Vite)          | `npm run dev:spa`  | 5173 | ❌          |
| SSR (Go server)     | `npm run dev`      | 3000 | ✅          |
| Regenerate manifest | `npm run manifest` | —    | ❌          |
| Production build    | `npm run build`    | —    | ❌          |

> **SSR mode** requires Go 1.22+ (`https://go.dev/dl/`) and running `fusee add server` first.

---

## Go SSR Engine (`engine-go`)

The Go SSR engine is a decoupled, optional package — **not bundled** at project init. Install it when you need server-side rendering:

```bash
fusee add server
```

Once installed at `framework/engine-go`, it:

- Reads `.fusee/manifest.json` (generated by `npm run manifest`) for route discovery
- Renders components server-side and hydrates them in the browser
- Serves static assets and handles client-side navigation

The engine is a standalone Go module and can also be used independently of the CLI.

---

## FREL (Fusée Reactive Expression Language)

FREL provides LINQ-style queries over arrays, iterables, and signals — all while maintaining fine-grained reactivity. It can be available by installing it from the cli using `fusee add frel`.

```typescript
import { from, toSignal } from "./framework/frel/frel.js";

// Reactive queries over arrays, iterables, and signals
const users = [
  { id: 1, name: "A" },
  { id: 2, name: "B" },
];
const filtered = toSignal(
  from(users)
    .where((u) => u.id > 1)
    .orderBy((u) => u.name),
);

filtered(); // [{id:2, name:"B"}]
```

---

## Comet HTML-Over-the-Wire Module

Comet keeps interactive behavior close to HTML and HTTP. Elements can issue requests,
send form values, and replace a selected part of the page with the returned HTML without
requiring a client-side router or a large client-side state layer.

The browser module uses `comet-*` attributes:

```html
<button
  comet-get="/notifications"
  comet-target="#notifications"
  comet-swap="innerHTML"
>
  Refresh notifications
</button>

<form comet-post="/profile" comet-target="#profile">
  <input name="displayName" />
  <button type="submit">Save</button>
</form>
```

Supported request attributes include:

- `comet-get`, `comet-post`, `comet-put`, `comet-patch`, and `comet-delete`
- `comet-trigger` for events such as `click`, `submit`, `change`, `load`, and polling with `every`
- `comet-target` and `comet-swap` for selecting the target and controlling the DOM update
- `comet-vals` and `comet-include` for adding request values
- `comet-indicator` for loading-state styling and `comet-confirm` for confirmation prompts
- `comet-push-url` for updating browser history
- `comet-swap-oob` for updating additional page regions outside the main target

Comet dispatches lifecycle events including `comet:beforeRequest`, `comet:afterRequest`,
`comet:beforeSwap`, `comet:afterSwap`, `comet:responseError`, and `comet:sendError`.
Handlers can cancel a request or a swap with `preventDefault()` and can inspect the
request, response, target, and swap details from the event.

Comet requests include metadata headers so the Go server can distinguish a fragment
request from a normal page request. The Go integration provides response helpers:

```go
if comet.IsComet(r) {
    comet.Retarget(w, "#content")
    comet.Reswap(w, "outerHTML")
    comet.PushURL(w, "/profile")
}
```

The server can also use `comet.Redirect(w, "/login")`. Comet understands server response
headers for retargeting, reswapping, redirects, and history updates, and supports
fragment-aware rendering so the same route can return a focused HTML fragment for Comet
requests or a complete document for a normal browser visit.

The browser implementation lives in `framework/core/comet-js/`, while the Go helpers live
in `framework/engine-go/comet/`.

---

## File-Based Routing

Drop a file in `app/pages/` and it becomes a route automatically:

```
app/pages/
  _layout.js        → wraps all pages
  index.js          → /
  about.js          → /about
  blog/[slug].js    → /blog/:slug  (dynamic)
```

Generate pages instantly:

```bash
fusee generate page contact     # → app/pages/contact.js
```

---

## Build-Time Template Compiler

Fusée compiles HTML templates into optimized virtual DOM calls at build time via the `fuseeCompilerPlugin` for Vite — zero runtime parsing overhead.

**Template file** (`Welcome.template.html`):

```html
<div class="card">
  <h2>Hello, {{ name }}!</h2>
  <input f-model="name" placeholder="Type a name..." />
  <button @click="increment">Clicked {{ count }} times</button>
  <p f-if="count() > 0">Double: <strong>{{ double }}</strong></p>
</div>
```

**Component file** (`Welcome.js`):

```javascript
import { render } from "./Welcome.template.html";

export const Welcome = defineComponent({
  render,
  setup() {
    const name = signal("World");
    const count = signal(0);
    const double = computed(() => count() * 2);
    return { name, count, double, increment: () => count(count() + 1) };
  },
});
```

---

## Key Features

- **Go-Powered CLI** — Blazing-fast scaffolding with cross-platform binaries (Windows, Linux, macOS Intel/ARM)
- **Optional Go SSR Engine** — Decoupled server package, install only when needed
- **Optional Comet Module(HTML-Over-the-Wire)** — Keep interactive behavior close to HTML and HTTP
- **Signals-First Reactivity** — Atomic fine-grained updates, only modified DOM nodes touched
- **File-Based Routing** — Nuxt-style automatic route discovery with layout support
- **Rust WASM Build-Time Compiler** — Recursive hybrid compiler + optional Rust WASM backend for peak throughput
- **Directives support** — `f-if`, `f-for`, `f-model`, `f-text`, `f-cloak`, `f-once`, `@event` modifiers
- **Web Components** — `defineElement()` builds native custom elements with reactive props, shadow DOM, scoped styles and SSR (declarative shadow DOM) in Node and Go
- **Dependency Injection** — Nested `provide`/`inject` with shadowing, across custom elements and with `@lit/context` interop
- **Composables & Stores** — Reactive state management patterns baked in
- **Server Actions** — Type-safe RPC-style functions for client→server communication
- **Full TypeScript Support** — Comprehensive `.d.ts` types for all framework primitives
- **Vite Integration** — Full HMR support and production build pipeline
- **Memory Safety** — Automatic effect disposal and explicit leak checks
- **Custom Plugins API** — Vue-style `app.use()` hooks for shared extensions

---

## Project Structure

A scaffolded Fusée project:

```
my-app/
├── app/
│   ├── pages/          # File-based routes (_layout, index, about, ...)
│   ├── components/     # Reusable UI components
│   ├── stores/         # Reactive state stores
│   ├── composables/    # Reusable logic hooks
│   ├── actions/        # Server actions
│   └── elements/       # Custom elements (defineElement)
├── framework/          # Fusée core engine (injected by CLI)
│   ├── core/           # Reactivity, compiler, directives, DI
│   ├── router/         # Client-side router
│   ├── server/         # Manifest generator & dev helpers
│   ├── types/          # TypeScript definitions
│   └── (*) engine-go/  # Go SSR engine (optional, fusee add server)
├── .fusee/             # Runtime manifest (generated)
├── index.html
├── vite.config.js
└── package.json
```

---

## TypeScript Support

Full type definitions are available for all framework primitives:

```typescript
import type { Signal, Computed, ComponentFactory } from "fusee-framework";
import type { Router, Route } from "fusee-framework/router";
import type { StoreHook } from "fusee-framework/store";
import type { ActionProxy } from "fusee-framework/actions";
```

Every fusée export is auto-imported in Vite builds (`framework/auto-import-preset.js`, typed in `framework/auto-imports.d.ts`). Your own services, components, stores, actions, utilities, and types should be imported explicitly.

Outside Vite (a plain `<script type="module">`, a quick demo), either import what you use or load `import 'fusee-framework/globals'`, which puts the whole API on `globalThis`. Avoid it in bundled apps: it keeps the entire framework in the bundle.

---

## Comet

Fusee SSR module has a special package too - Comet: a HTMX-style package which is intended to be used in SSR-only builds to swap html content without a full page reload. It uses the same reactivity engine as the core engine, so you can use signals, computed, and effects in your Comet components too.

It can be installed from the CLI after installing the SSR engine (default: not installed).

## Performance Benchmarks

The benchmark runs the operations from
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) on a keyed table in
headless Chromium. Each sample is read from a Chrome trace: it is the busy main-thread time from
the start of the operation until the frame that shows the result is committed (script, style,
layout and paint), with time spent idle waiting for the next frame left out. Every sample starts
from a freshly loaded page with 3 warmup runs, and the DOM is checked after each operation.
Some tests slow the CPU down, as js-framework-benchmark does.

Fusée (current `main`), median of 15 runs, AMD Ryzen 5 3500U laptop (lower is better):

| Operation              | CPU slowdown |  Median  | ± 95% CI |  Script  |
| :--------------------- | :----------: | :------: | :------: | :------: |
| Create 1,000 rows      |      1x      |  51.6 ms |  ± 4.4 ms  |  14.5 ms |
| Replace 1,000 rows     |      1x      |  51.0 ms |  ± 4.2 ms  |  20.1 ms |
| Update every 10th row  |      4x      |  56.9 ms |  ± 4.6 ms  |   5.0 ms |
| Select row             |      4x      |   9.0 ms |  ± 0.8 ms  |   2.5 ms |
| Swap 2 rows            |      4x      |  39.3 ms |  ± 2.4 ms  |   3.2 ms |
| Remove row             |      2x      |  25.7 ms |  ± 3.6 ms  |   2.6 ms |
| Append 1,000 rows      |      1x      |  47.1 ms |  ± 4.1 ms  |  13.4 ms |
| Clear 1,000 rows       |      4x      |  39.1 ms |  ± 8.2 ms  |  36.9 ms |

"Script" is the part of the median spent in JavaScript, including garbage collection; the rest
is the browser's style, layout and paint work.

### Memory

JS heap after a forced garbage collection:

| Version        | Fresh page | 1,000 rows | After 5× create + clear |
| :------------- | :--------: | :--------: | :---------------------: |
| Current `main` |  1.10 MB   |  4.38 MB   |       **1.36 MB**       |
| 2.7.2          |  1.10 MB   |  4.41 MB   |        10.81 MB         |

Up to 2.7.1, `f-for` kept every row it had ever rendered reachable, so each create + clear
cycle left about 1.9 MB behind. Removed rows are now freed.

A ranking against React, Vue, Angular, Svelte, Solid, Preact, Qwik, Lit and Mithril with this
method is being re-measured. The previous ranking measured each operation plus two animation
frames, so frame timing (about 33 ms) hid most of the differences between frameworks.

### Bundle size

Production JavaScript of the same benchmark app (a keyed 1,000-row table), built with Vite
and compressed with gzip level 9 and brotli quality 11:

|  Rank  | Framework              |     gzip     |    brotli    |
| :----: | :--------------------- | :----------: | :----------: |
| **1**  | **Solid**              |    3.9 KB    |    3.5 KB    |
| **2**  | **Preact**             |    5.9 KB    |    5.4 KB    |
| **3**  | **Lit**                |    6.3 KB    |    5.7 KB    |
| **4**  | <mark>**Fusée**</mark> | **6.3 KB**   | **5.7 KB**   |
| **5**  | **Svelte**             |   12.8 KB    |   11.7 KB    |
| **6**  | **Mithril**            |   13.8 KB    |   12.1 KB    |
| **7**  | **Vue**                |   24.5 KB    |   22.1 KB    |
| **8**  | **Qwik**               |   27.3 KB    |   24.4 KB    |
| **9**  | **Angular**            |   34.6 KB    |   31.0 KB    |
| **10** | **React**              |   44.9 KB    |   39.3 KB    |

Lit and Fusée are within a few bytes of each other: Lit is 12 bytes smaller with gzip, Fusée
9 bytes smaller with brotli.

Fusée is tree-shakable: an app only ships the parts it uses. The main cost to watch is the
runtime template compiler, which string templates (`template: '...'`) need. Minimal counter
component, gzip:

| Component style                                         |  gzip   |
| :------------------------------------------------------ | :-----: |
| Compiled template + `defineCompiledComponent()`          | 6.4 KB  |
| JSX (`render()`, via the fusée JSX runtime)              | 6.5 KB  |
| String template + `defineComponent()`                    | 11.1 KB |
| String template custom element, `defineElement()`        | 13.3 KB |

`defineCompiledComponent()` works like `defineComponent()` for components with a compiled
`render` (a `.fusee` file, or `.template.html` through the compiler plugin), and leaves the
template compiler out. JSX components get the same saving automatically.

---

## Building the CLI

The CLI, being cross-platform for windows, linux, mac-arm64 and mac-intel, is built from source using the included `build-cli.mjs` script:

```bash
node bin/build-cli.mjs
```

Output: `bin/create-fusee-{win.exe,linux,mac-arm64,mac-intel}`

---

## Testing

```bash
npm test
npx vitest --reporter=verbose
npx vitest # watch mode
```

**740 tests passing.** Coverage includes: reactivity engine, component lifecycle, DI, directives, events, memory safety, TypeScript types, and integration scenarios.

---

## Roadmap

- [x] Go-powered CLI with cross-platform binaries
- [x] Optional Go SSR engine (`fusee add server`)
- [x] File-based routing with layout support
- [x] Build-time HTML template compiler
- [x] Rust WASM compiler backend
- [x] Comprehensive TypeScript definitions
- [x] Generators for pages, components, stores, composables, actions
- [x] JSX/TSX Support
- [x] Web Components (`defineElement`) with SSR and `fusee generate element`
- [ ] Production SSR build pipeline
- [ ] Plugin system for third-party extensions

---

Built by Sebi Somu — a forward-thinking JavaScript Architect.

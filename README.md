# Fusée Framework

**v1.9.0 — Signals-First JS Framework | Atomic Reactivity | Peak Performance**

Fusée is a custom, high-performance fine-grained reactive JavaScript framework built for speed and simplicity. It features a recursive, non-greedy compiler, a signals-based reactivity engine, Dependency Injection for components and a comprehensive CLI for instant application scaffolding.

---

## Quick Start

The fastest way to get started with Fusée is via the **Go-Powered CLI**:

```bash
# 1. Install Fusée CLI globally
npm install -g fusee-framework

# 2. Scaffold a new high-performance project
create-fusee-app my-awesome-app
# or simply
fusee init my-awesome-app
```

Follow the interactive prompt to choose your template (**JavaScript** or **TypeScript**) and launch your app instantly!

---

## File-Based Routing (Nuxt-style)

Fusée now supports automated, file-based routing!

- **Pages**: Just drop a file in `app/pages/` and it becomes a route.
- **Layouts**: Use `app/pages/_layout.js` to wrap your pages in consistent UI structures.
- **Dynamic Routes**: Support for `[id].js` style dynamic parameters.

```bash
# Generate a new page instantly
fusee generate page contact
```

---

## Build-Time HTML Template Compiler (New in v1.9)

Fusée now features a fully integrated **Build-Time Template Compiler** powered by the `fuseeCompilerPlugin` for Vite. Instead of parsing and compiling HTML strings at runtime, Fusée compiles external HTML templates into highly optimized virtual DOM creation calls (`h`, `hText`, `hIf`, `hFor`) during the build/dev stage.

### Why use the Build-Time Compiler?

- **Zero Runtime Overhead**: No template parsing in the browser, leading to smaller bundles and faster page load speeds.
- **Separation of Concerns**: Write clean HTML in `.template.html` files with full editor autocomplete, syntax highlighting, and formatting support.
- **Compile-Time Warnings**: Errors in template syntax are caught immediately in your terminal or browser console during development.

### How to use it:

1. **Create an HTML template file** (e.g., `Welcome.template.html`):

```html
<div class="card">
  <h2>Hello, {{ name }}!</h2>
  <input f-model="name" placeholder="Type a name..." />

  <button @click="increment">Clicked {{ count }} times</button>

  <p f-if="count() > 0">Double: <strong>{{ double }}</strong></p>
</div>
```

2. **Import and bind the `render` function** in your component file (e.g., `Welcome.js`):

```javascript
import { render } from "./Welcome.template.html";

export const Welcome = defineComponent({
  render,
  setup() {
    const name = signal("World");
    const count = signal(0);
    const double = computed(() => count() * 2);

    return {
      name,
      count,
      double,
      increment: () => count(count() + 1),
    };
  },
});
```

Vite intercepts the `.template.html` import, runs the compiler, and inlines the generated JavaScript render code seamlessly!

Benchmark results for specific stress tests (from https://github.com/codegenixdev/js-frontend-frameworks-benchmark):

| Action                             | Avg Duration (ms) |
| :--------------------------------- | :---------------- |
| Create 50,000 Rows                 | 12.60             |
| Update Every 10th Row (Salary +50) | 15.90             |
| Swap 2nd and 9th-to-last Rows      | 4.60              |
| Clear All Rows                     | 0.70              |
| **Total Average**                  | **33.80**         |

---

## Key Features

- **New Go-Powered CLI**: Blazing fast project scaffolding and resource generation.
- **Signals/Resources-First Reactivity**: Modern atomic updates that ensure only the modified parts of the DOM are touched.
- **Nuxt-style File Routing**: Automated route discovery with layout support.
- **Recursive Hybrid Compiler**: A robust architectural approach to node traversal.
- **Optimized Directives**: Native support for `f-if`, `f-for`, `f-model`, `f-text`, `f-cloak` and more.
- **Performance Shield (`f-once`)**: Isolate and stabilize static subtrees.
- **Vite Integration**: Full support for the fastest development workflow and HMR.
- **Dependency Injection**: Nested Provide/Inject and Shadowing.
- **Memory Safety**: Explicit checks for memory leaks and automatic effect disposal.

---

## Project Structure

A typical Fusée project looks like this:

- **`framework/`**: The core reactive engine.
- **`app/`**: Your application logic (routes, components).
- **`index.html`**: The entry point of your reactive world.

---

## Example Component

```javascript
export const Welcome = defineComponent({
  setup() {
    const name = signal("World");
    const count = signal(0);
    const double = computed(() => count() * 2);

    return {
      name,
      count,
      double,
      inc: () => count(count() + 1),
      template: `
                <div class="card">
                    <h2>Hello, {{ name }}!</h2>
                    <input f-model="name" placeholder="Name" />
                    
                    <button @click.debounce.300ms="inc">
                        Clicked {{ count }} times
                    </button>
                    
                    <p f-if="count() > 0">
                        Double: <strong>{{ double }}</strong>
                    </p>
                </div>
            `,
    };
  },
});
```

---

## Quality Assurance & Testing

Fusée is built with a test-driven mindset to ensure the reliability of its reactivity engine and component lifecycle.

- **Total Tests:** `550`
- **Status:** `All Passed`
- **Framework:** [Vitest](https://vitest.dev/)
- **Environment:** JSDOM (Browser simulation)

### Running Tests

```bash
# Run all tests (easiest)
npm test

# Run all tests with verbose output
npx vitest --reporter=verbose

# Run type tests only
npx vitest run --typecheck

# Run tests in watch mode
npx vitest
```

### Test Coverage includes:

- **Reactivity Engine:** 100% (Signals, Batching, Computed, Watchers).
- **Component System:** Props, Slots, Async Components, and Lifecycle Hooks.
- **Dependency Injection:** Nested Provide/Inject and Shadowing.
- **Directives:** `f-if`, `f-for`, `f-model`, and Event Modifiers.
- **Events:** Event delegation and native event handling.
- **Memory Safety:** Explicit checks for memory leaks and automatic effect disposal.
- **Type Safety:** Comprehensive TypeScript definitions and type tests.
- **Integration Tests:** Advanced module combinations and edge cases.

---

## Future Roadmap

- [ ] Advanced state management and SSR support
- [x] Optimising the existing HTML compiler and remove useless DOM trasversals in lists
- [ ] Integrated backend development support

Built by me, Sebi Somu, a forward-thinking JavaScript Architect.

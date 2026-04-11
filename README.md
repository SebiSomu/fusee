# Fusée Framework 🚀
**v1.3.0 — Signals-First JS Framework | Atomic Reactivity | Peak Performance**

Fusée is a custom, high-performance fine-grained reactive JavaScript framework built for speed and simplicity. It features a recursive, non-greedy compiler, a signals-based reactivity engine, Dependency Injection for components and a comprehensive CLI for instant application scaffolding.

---

## ⚡ Quick Start

The fastest way to get started with Fusée is via the CLI:

```bash
# 1. Install Fusée globally
npm install -g fusee-framework

# 2. Scaffold your first project
create-fusee-app .
```
Follow the interactive prompt to choose your template (**JavaScript** or **TypeScript**) and launch your app with `npm run dev`!

---

## 🔥 Key Features

- **Signals-First Reactivity**: Modern atomic updates that ensure only the modified parts of the DOM are touched.
- **Recursive Hybrid Compiler**: A robust architectural approach to node traversal, eliminating rendering bugs while maintaining "greedy" directive processing for speed.
- **Strict Component System**: Use `defineComponent` for prop validation, lifecycle hooks (`onMount`, `onUnmount`), and automated cleanup.
- **Optimized Directives**: Native support for `f-if`, `f-for`, `f-model`, `f-text`, `f-cloak` and more.
- **Performance Shield (`f-once`)**: Isolate and stabilize static subtrees to prevent unnecessary reactivity.
- **Vite Integration**: Full support for the fastest development workflow and Hot Module Replacement (HMR).

---

## 🛠 Project Structure

A typical Fusée project looks like this:

- **`framework/`**: The core reactive engine.
- **`app/`**: Your application logic (routes, components).
- **`index.html`**: The entry point of your reactive world.

---

## 📝 Example Component

```javascript
export const Welcome = defineComponent({
    setup() {
        const name = signal('World');
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
            `
        };
    }
});
```

---

## 🚀 Future Roadmap

- [ ] Global Store Management
- [ ] Advanced file-based routing support
- [ ] Integrated lightweight compiler which transforms declarative HTML into optimized runtime instructions

Built with ❤️ by me, Sebi Somu, a forward-thinking JavaScript Architect.

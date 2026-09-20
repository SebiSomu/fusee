// jsx-dev-runtime.js
// Bundlers (Vite/esbuild in dev mode) import this instead of jsx-runtime.js
// when NODE_ENV !== 'production'. Same implementation, just the entry point
// dev tooling expects to exist.

export { jsxDEV, Fragment, For, Show, Slot, on, defineComponent } from './jsx-runtime.js'
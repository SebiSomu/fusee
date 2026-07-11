import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { fuseeCompilerPlugin } from "../../../framework/core/compiler/plugins/compiler-plugin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [fuseeCompilerPlugin()],
  resolve: {
    alias: {
      "fusee-framework": path.resolve(__dirname, "../../../framework"),
      "fusee/runtime/h.js": path.resolve(__dirname, "../../../framework/core/h.js"),
    },
  },
  optimizeDeps: {
    exclude: ["fusee-framework"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
});

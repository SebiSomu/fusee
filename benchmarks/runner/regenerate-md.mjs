import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMarkdown } from "./report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const resultsPath = path.join(ROOT, "results", "latest.json");

const payload = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));
const md = buildMarkdown(payload.results, payload.timestamp, payload.runs);

fs.writeFileSync(path.join(ROOT, "results", "latest.md"), md);
console.log("✅ latest.md regenerated with rankings and overall ranking");

import fs from "node:fs";
import path from "node:path";
import { ROOT, TESTS } from "./config.mjs";

function fmt(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  return `${ms.toFixed(2)} ms`;
}

export function printTerminalReport(allResults) {
  const frameworks = Object.keys(allResults).filter((k) => k !== "__names");

  console.log("\n" + "═".repeat(78));
  console.log("  BENCHMARK RESULTS (mean +/- stddev, lower is better)");
  console.log("═".repeat(78));

  for (const test of TESTS) {
    console.log(`\n> ${test.label}`);
    console.log("─".repeat(78));

    const rows = frameworks
      .map((fwId) => {
        const r = allResults[fwId][test.id];
        if (!r || r.error) return { fwId, mean: Infinity, error: r?.error };
        return { fwId, mean: r.mean, stddev: r.stddev, min: r.min, max: r.max };
      })
      .sort((a, b) => a.mean - b.mean);

    const fastest = rows[0]?.mean;

    for (const row of rows) {
      const label = (allResults.__names[row.fwId] ?? row.fwId).padEnd(10);
      if (row.error) {
        console.log(`  ${label} FAILED: ${row.error.slice(0, 60)}`);
        continue;
      }
      const relative = fastest > 0 ? (row.mean / fastest).toFixed(2) : "1.00";
      const bar = "#".repeat(
        Math.min(40, Math.round((row.mean / fastest) * 4)),
      );
      console.log(
        `  ${label} ${fmt(row.mean).padStart(10)} +/- ${fmt(row.stddev).padEnd(9)} ` +
          `(${relative}x)  ${bar}`,
      );
    }
  }

  console.log("\n" + "═".repeat(78));
  printOverallRanking(allResults);
  console.log("═".repeat(78) + "\n");
}

function printOverallRanking(allResults) {
  const frameworks = Object.keys(allResults).filter((k) => k !== "__names");

  const scores = frameworks.map((fwId) => {
    let totalMean = 0;
    let validTests = 0;
    for (const test of TESTS) {
      const r = allResults[fwId][test.id];
      if (r && !r.error) {
        totalMean += r.mean;
        validTests++;
      }
    }
    return { fwId, total: validTests > 0 ? totalMean : Infinity };
  });

  scores.sort((a, b) => a.total - b.total);

  console.log("  OVERALL RANKING (sum of mean times across all tests)");
  console.log("─".repeat(78));
  scores.forEach((s, i) => {
    const medal = ["1.", "2.", "3."][i] ?? `${i + 1}.`;
    const name = (allResults.__names[s.fwId] ?? s.fwId).padEnd(10);
    console.log(`  ${medal} ${name} ${fmt(s.total)}`);
  });
}

export function saveResults(allResults, runs) {
  const resultsDir = path.join(ROOT, "results");
  fs.mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const payload = { timestamp, runs, results: allResults };

  fs.writeFileSync(
    path.join(resultsDir, "latest.json"),
    JSON.stringify(payload, null, 2),
  );
  fs.writeFileSync(
    path.join(resultsDir, "latest.md"),
    buildMarkdown(allResults, timestamp, runs),
  );
}

function buildMarkdown(allResults, timestamp, runs) {
  const frameworks = Object.keys(allResults).filter((k) => k !== "__names");
  let md = `# Fusée Benchmark Results\n\n`;
  md += `Generated: ${timestamp}\n\n`;
  md += `Runs per test: ${runs}\n\n`;

  for (const test of TESTS) {
    md += `## ${test.label}\n\n`;
    md += `| Framework | Mean | Median | Min | Max | Std Dev |\n`;
    md += `|---|---|---|---|---|---|\n`;

    const rows = frameworks
      .map((fwId) => ({ fwId, r: allResults[fwId][test.id] }))
      .sort((a, b) => (a.r?.mean ?? Infinity) - (b.r?.mean ?? Infinity));

    for (const { fwId, r } of rows) {
      const name = allResults.__names[fwId] ?? fwId;
      if (!r || r.error) {
        md += `| ${name} | ERROR: ${r?.error ?? "unknown"} | | | | |\n`;
        continue;
      }
      md += `| ${name} | ${fmt(r.mean)} | ${fmt(r.median)} | ${fmt(r.min)} | ${fmt(r.max)} | ${fmt(r.stddev)} |\n`;
    }
    md += "\n";
  }

  return md;
}

#!/usr/bin/env node
/**
 * Bundle budget guard.
 *
 * Fails the build when the *initial* JS payload (the chunks referenced directly
 * from dist/index.html) grows beyond the agreed budget. Route chunks loaded via
 * React.lazy are intentionally excluded — they are paid for on navigation only.
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB || 900);

let html;
try {
  html = readFileSync(join(DIST, "index.html"), "utf8");
} catch {
  console.error(`[bundle-budget] ${DIST}/index.html not found — run the build first.`);
  process.exit(1);
}

const referenced = new Set(
  [...html.matchAll(/assets\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]),
);

if (referenced.size === 0) {
  console.error("[bundle-budget] No JS assets referenced from index.html.");
  process.exit(1);
}

const available = new Set(readdirSync(join(DIST, "assets")));
const rows = [];
let totalBytes = 0;

for (const file of referenced) {
  if (!available.has(file)) continue;
  const bytes = statSync(join(DIST, "assets", file)).size;
  totalBytes += bytes;
  rows.push({ file, kb: +(bytes / 1024).toFixed(1) });
}

rows.sort((a, b) => b.kb - a.kb);
const totalKb = +(totalBytes / 1024).toFixed(1);

console.log("[bundle-budget] Initial JS chunks:");
for (const row of rows) console.log(`  ${String(row.kb).padStart(8)} KB  ${row.file}`);
console.log(`[bundle-budget] Total: ${totalKb} KB (budget ${BUDGET_KB} KB)`);

if (totalKb > BUDGET_KB) {
  console.error(
    `[bundle-budget] FAIL — initial payload exceeds the budget by ${(totalKb - BUDGET_KB).toFixed(1)} KB.`,
  );
  process.exit(1);
}

console.log("[bundle-budget] OK");

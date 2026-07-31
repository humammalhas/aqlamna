// scripts/lint-html.mjs — verify tag balance in every .html under site/
// Wired into npm test. Exit 1 on any mismatch.
//
// This catches bugs that pass every CSS check, every HTTP-status check, and
// every theme-consistency test: a missing </style> makes the browser swallow
// the entire page as CSS, yet curl returns 200 and every programmatic check
// that reads a linked .css file passes.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const siteDir = resolve(root, "site");

function collectHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectHtml(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

const files = collectHtml(siteDir);

if (files.length === 0) {
  console.error("No .html files found in site/");
  process.exit(1);
}

// Tags to balance — opening and closing must match
// Use word-boundary to avoid matching <header>, <scripting>, <bodybuilder> etc.
const PAIRS = [
  [/<style\b/gi, /<\/style>/gi],
  [/<script\b/gi, /<\/script>/gi],
  [/<head\b/gi, /<\/head>/gi],
  [/<body\b/gi, /<\/body>/gi],
];

let errors = 0;

for (const f of files) {
  const rel = relative(root, f);
  const html = readFileSync(f, "utf-8");

  for (const [open, close] of PAIRS) {
    const openCount = (html.match(new RegExp(open, "gi")) || []).length;
    const closeCount = (html.match(new RegExp(close, "gi")) || []).length;

    if (openCount !== closeCount) {
      console.error(`  ${rel}: ${open} (${openCount}) \u2260 ${close} (${closeCount})`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\nlint-html: ${errors} tag mismatch(es) across ${files.length} file(s) \u2014 FAIL`);
  process.exit(1);
}

console.log(`lint-html: ${files.length} file(s), all tags balanced`);

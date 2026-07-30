// ---------------------------------------------------------------------------
// build-rules.mjs — reads ../../ARABIC_MASTERY.md and emits
// src/generated/rules.json with three categories of rules:
//   pair    — every ❌/✅ table row (word-boundary matchable)
//   pattern — hand-written from rules-extra.json
//   advisory — §1.1-1.7, §5 (not pattern-matchable; for reference)
//
// RULE ZERO: ARABIC_MASTERY.md is READ-ONLY. This script reads it and NEVER
// writes to it. Do not add fenced blocks, metadata, YAML, or anything else.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASTERY_PATH = resolve(__dirname, "..", "..", "..", "ARABIC_MASTERY.md");
const EXTRA_PATH = resolve(__dirname, "..", "rules-extra.json");
const OUT_PATH = resolve(__dirname, "..", "src", "generated", "rules.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sections whose rules are advisory (not lintable). */
const ADVISORY_SECTIONS = new Set([
  "1.1", "1.2", "1.3", "1.4", "1.4b", "1.5", "1.6", "1.7",
  "5.1", "5.2", "5.3", "5.4",
]);

/** Extract the bare number from a heading like "### 1b.1 ..." or "### 2.1 ..." */
function sectionId(heading) {
  const m = /^#+\s+([\d]+[a-z]*(?:\.[\d]+[a-z]*)?)\b/.exec(heading);
  return m ? m[1] : null;
}

/** Get the heading level from a line: 1 for #, 2 for ##, 3 for ###, etc. */
function headingLevel(line) {
  const m = /^(#+)/.exec(line);
  return m ? m[1].length : 0;
}

/** Check if a row is a markdown table separator (|---|---|) */
function isSeparator(row) {
  return /^\|[\s\-:]+\|/.test(row);
}

/**
 * Split a table row into cells, stripping leading/trailing | and whitespace.
 */
function splitCells(row) {
  return row
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Parse a table header to find the column index of ❌ and ✅.
 * Returns { badIdx, goodIdx } or null if not a pair table.
 */
function parseHeader(headerRow) {
  const cells = splitCells(headerRow);
  let badIdx = -1;
  let goodIdx = -1;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.includes("❌") && badIdx === -1) badIdx = i;
    if (cell.includes("✅") && goodIdx === -1) goodIdx = i;
  }

  if (badIdx === -1 || goodIdx === -1) return null;
  return { badIdx, goodIdx };
}

/** Remove only markdown formatting (**, *, `, links) from cell text.
 *  Does NOT strip quotes or guillemets — those are content. */
function cleanCell(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .trim();
}

/**
 * Find the **القاعدة:** line within a section's body text.
 * Handles multi-line qaedas by joining bullet points.
 */
function extractQaeda(text) {
  // Find the **القاعدة:** line
  const lines = text.split("\n");
  let inQaeda = false;
  const parts = [];

  for (const line of lines) {
    if (/\*\*القاعدة:\*\*/.test(line)) {
      inQaeda = true;
      const after = line.replace(/^.*\*\*القاعدة:\*\*\s*/, "").trim();
      if (after) parts.push(after);
      continue;
    }
    if (inQaeda && line.trim().startsWith("- ")) {
      parts.push(line.trim().replace(/^-\s*/, ""));
      continue;
    }
    if (inQaeda && line.trim() === "") continue; // blank lines within qaeda
    if (inQaeda && line.trim() && !line.trim().startsWith("- ")) {
      inQaeda = false; // qaeda ended
      break;
    }
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

const masteryText = readFileSync(MASTERY_PATH, "utf-8");
const lines = masteryText.split("\n");

/** Raw pair data collected during parsing */
const rawPairs = []; // { bad, good, section }
const advisoryRules = [];

let currentSection = null;
let inTable = false;
let tableHeader = null;
let tableRows = [];

// Read the extra rules file for pattern rules
let extraRules = [];
try {
  const extraText = readFileSync(EXTRA_PATH, "utf-8");
  extraRules = JSON.parse(extraText);
} catch {
  console.warn("rules-extra.json not found or invalid — no pattern rules loaded");
}

// ---- Parse tables ----

function flushTable() {
  if (!inTable || !tableHeader || tableRows.length === 0) {
    tableHeader = null;
    tableRows = [];
    inTable = false;
    return;
  }

  const indices = parseHeader(tableHeader);
  if (!indices) {
    tableHeader = null;
    tableRows = [];
    inTable = false;
    return;
  }

  const { badIdx, goodIdx } = indices;

  for (const row of tableRows) {
    // Skip rows with ~~ (strikethrough = "don't correct")
    if (/~~/.test(row)) continue;

    const cells = splitCells(row);
    const badCell = cells[badIdx];
    const goodCell = cells[goodIdx];
    if (!badCell || !goodCell) continue;

    const bad = cleanCell(badCell);
    const good = cleanCell(goodCell);

    if (!bad || !good) continue;
    if (bad === good) continue; // skip identical pairs
    if (bad.startsWith("⚠️") || good.startsWith("⚠️")) continue;

    rawPairs.push({ bad, good, section: currentSection });
  }

  tableHeader = null;
  tableRows = [];
  inTable = false;
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const level = headingLevel(line);

  if (level >= 2) {
    flushTable();
    const sid = sectionId(line);
    if (sid) currentSection = sid;
    continue;
  }

  if (!line.startsWith("|")) {
    if (inTable) flushTable();
    continue;
  }

  if (isSeparator(line)) continue;

  if (!inTable) {
    inTable = true;
    tableHeader = line;
    tableRows = [];
  } else {
    tableRows.push(line);
  }
}

flushTable();

// ---- Extract qaedas per section and assemble pair rules ----

/** Map of section → qaeda text */
const qaedaBySection = new Map();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const level = headingLevel(line);
  if (level < 2) continue;

  const sid = sectionId(line);
  if (!sid) continue;

  // Grab all text until next section heading
  let body = "";
  for (let j = i + 1; j < lines.length; j++) {
    if (headingLevel(lines[j]) >= 2) break;
    body += lines[j] + "\n";
  }

  const qaeda = extractQaeda(body);
  if (qaeda) qaedaBySection.set(sid, qaeda);
}

// Assemble pair rules with ids and qaedas
const pairRules = [];
const sectionCounters = new Map();

for (const p of rawPairs) {
  const count = (sectionCounters.get(p.section) || 0) + 1;
  sectionCounters.set(p.section, count);

  // §1b.5 verb-precision rules are judgment calls — downgrade to info
  const severity = p.section === "1b.5" ? "info" : "warning";

  pairRules.push({
    id: `${p.section}.${count}`,
    kind: "pair",
    bad: p.bad,
    good: p.good,
    severity,
    messageAr: qaedaBySection.get(p.section) || "",
    section: p.section,
  });
}

// ---- Advisory rules ----

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const level = headingLevel(line);
  if (level < 3) continue;

  const sid = sectionId(line);
  if (!sid || !ADVISORY_SECTIONS.has(sid)) continue;
  if (advisoryRules.some((r) => r.id === sid)) continue;

  let body = "";
  for (let j = i + 1; j < lines.length; j++) {
    if (headingLevel(lines[j]) >= 3) break;
    body += lines[j] + "\n";
  }
  const qaeda = extractQaeda(body);
  if (qaeda) {
    advisoryRules.push({
      id: sid,
      kind: "advisory",
      severity: "info",
      messageAr: qaeda,
      section: sid,
    });
  }
}

// ---------------------------------------------------------------------------
// Assemble output
// ---------------------------------------------------------------------------

const stats = statSync(MASTERY_PATH);
const lastModified = stats.mtime.toISOString();

const output = {
  _meta: {
    source: "ARABIC_MASTERY.md",
    lastModified,
    generatedAt: new Date().toISOString(),
    counts: {
      pair: pairRules.length,
      pattern: extraRules.length,
      advisory: advisoryRules.length,
      total: pairRules.length + extraRules.length + advisoryRules.length,
    },
  },
  rules: [
    ...pairRules,
    ...extraRules.map((r) => ({ ...r, kind: "pattern", severity: "warning" })),
    ...advisoryRules,
  ],
};

// Write as TypeScript module for browser + Node compat
const tsContent = `// Auto-generated by build-rules.mjs from ARABIC_MASTERY.md — DO NOT EDIT.
// Last generated: ${output._meta.generatedAt}
// Source last modified: ${output._meta.lastModified}

import type { RulesFile } from "../types.js";

const rules: RulesFile = ${JSON.stringify(output, null, 2)} as const;

export default rules;
`;
writeFileSync(OUT_PATH, tsContent, "utf-8");
console.log(
  `✓ rules.ts written — ${pairRules.length} pair, ${extraRules.length} pattern, ${advisoryRules.length} advisory (${output._meta.counts.total} total)`
);

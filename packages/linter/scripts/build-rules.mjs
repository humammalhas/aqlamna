// ---------------------------------------------------------------------------
// build-rules.mjs — reads ../../ARABIC_MASTERY.md and emits ONE file,
// src/generated/rules.ts, a TypeScript module holding three categories of rules:
//   pair    — every ❌/✅ table row (word-boundary matchable)
//   pattern — hand-written from rules-extra.json
//   advisory — §1.1-1.7, §5 (not pattern-matchable; for reference)
//
// It emitted rules.json until 31 Jul 2026 and this header still said so for a
// day afterwards, while the abandoned dist/generated/rules.json answered
// questions with 27-hour-old data. If you change what this writes, change this
// sentence in the same edit and declare the new output in
// scripts/artifacts.manifest.mjs.
//
// The generated file carries a provenance block (scripts/artifact-provenance.mjs)
// recording the corpus md5, so scripts/check-artifacts.mjs can prove it is
// current without trusting an mtime.
//
// RULE ZERO: ARABIC_MASTERY.md is READ-ONLY. This script reads it and NEVER
// writes to it. Do not add fenced blocks, metadata, YAML, or anything else.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProvenance, provenanceComment } from "../../../scripts/artifact-provenance.mjs";

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
 * Parse a table header to find the column index of ❌ and ✅, plus the
 * per-row explanation column if the table has one.
 *
 * The explanation column has a different header in every section — `السبب`
 * in §1b.2 and §2.4, `ملاحظة` in §2.1, `القاعدة` in §2.2 — so it is found
 * structurally, as the first column that is neither ❌ nor ✅, rather than by
 * matching a list of header words. A new table with a new header name is
 * picked up without touching this script.
 *
 * Returns { badIdx, goodIdx, reasonIdx } — reasonIdx is -1 for a two-column
 * table. Null if not a pair table at all.
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

  let reasonIdx = -1;
  for (let i = 0; i < cells.length; i++) {
    if (i === badIdx || i === goodIdx) continue;
    if (cells[i].length === 0) continue;
    reasonIdx = i;
    break;
  }

  return { badIdx, goodIdx, reasonIdx };
}

/** Heading text with the leading number stripped: "### 2.5 أخطاء تشكيلية" → "أخطاء تشكيلية". */
function headingText(line) {
  return line
    .replace(/^#+\s*/, "")
    .replace(/^[\d]+[a-z]*(?:\.[\d]+[a-z]*)?\s*/, "")
    .replace(/\s*\(\d+[^)]*\)\s*$/, "") // drop trailing counts like "(79 تصحيحًا صامتًا)"
    .trim();
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
/** Nearest preceding heading text — the last-resort message source. */
let currentHeading = "";
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

  const { badIdx, goodIdx, reasonIdx } = indices;

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

    // The row's own explanation, when the table carries one. This is the most
    // specific message available and it beats the section-wide القاعدة.
    const reason = reasonIdx >= 0 && cells[reasonIdx] ? cleanCell(cells[reasonIdx]) : "";

    rawPairs.push({
      bad,
      good,
      section: currentSection,
      reason: reason.startsWith("⚠️") ? "" : reason,
      heading: currentHeading,
    });
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
    // Tracked for ALL headings, numbered or not: §3's tashkeel table sits
    // under "### تشكيل أفعال وأسماء شائعة", which carries no section number
    // but is the only description that table has.
    currentHeading = headingText(line);
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
/** rule id → which level of the chain supplied its message. Reported below. */
const messageSource = new Map();

for (const p of rawPairs) {
  const count = (sectionCounters.get(p.section) || 0) + 1;
  sectionCounters.set(p.section, count);

  // §1b.5 verb-precision rules are judgment calls — downgrade to info
  const severity = p.section === "1b.5" ? "info" : "warning";

  // Message provenance, most specific first. Every level reads OUT of
  // ARABIC_MASTERY.md — nothing is authored here (hard rule 1).
  //   1. the row's own reason column       (§1b.2 السبب, §2.1 ملاحظة, §2.4 السبب)
  //   2. the section's **القاعدة:** line   (§1b.1, §1b.3, §1b.4, …)
  //   3. the nearest heading text          (§2.5, §3 — two-column tables with
  //                                         no القاعدة paragraph)
  // 26 of 76 rules used to fall off the end of this chain and ship "".
  const message = p.reason || qaedaBySection.get(p.section) || p.heading || "";
  messageSource.set(
    `${p.section}.${count}`,
    p.reason ? "reason-column" : qaedaBySection.get(p.section) ? "qaeda" : p.heading ? "heading" : "NONE",
  );

  pairRules.push({
    id: `${p.section}.${count}`,
    kind: "pair",
    bad: p.bad,
    good: p.good,
    severity,
    messageAr: message,
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
const prov = buildProvenance({
  generator: fileURLToPath(import.meta.url),
  artifact: OUT_PATH,
  source: MASTERY_PATH,
  sourceText: masteryText,
});

const tsContent = `// Auto-generated by build-rules.mjs from ARABIC_MASTERY.md — DO NOT EDIT.
${provenanceComment(prov)}

import type { RulesFile } from "../types.js";

const rules: RulesFile = ${JSON.stringify(output, null, 2)} as const;

export default rules;
`;
writeFileSync(OUT_PATH, tsContent, "utf-8");

const masteryMd5 = prov.sourceMd5;

console.log(
  `✓ rules.ts written — ${pairRules.length} pair, ${extraRules.length} pattern, ${advisoryRules.length} advisory (${output._meta.counts.total} total, md5 ${masteryMd5})`
);

// ---- Message provenance ----------------------------------------------------
// A rule that fires without a sentence teaches nothing and trains authors to
// ignore the linter. Report where every message came from, and name any rule
// the corpus cannot explain — that is a gap in ARABIC_MASTERY.md for the owner
// to fill, never a sentence for this script to invent (hard rule 1).

const provenance = { "reason-column": 0, qaeda: 0, heading: 0, NONE: 0 };
for (const src of messageSource.values()) provenance[src]++;
console.log(
  `  messages: ${provenance["reason-column"]} from a reason column, ` +
    `${provenance.qaeda} from **القاعدة:**, ${provenance.heading} from a heading`,
);

const unexplained = output.rules.filter(
  (r) => typeof r.messageAr !== "string" || r.messageAr.trim().length === 0,
);
if (unexplained.length > 0) {
  console.error(
    `\n⚠️  ${unexplained.length} rule(s) have no explanation anywhere in ARABIC_MASTERY.md.\n` +
      `   Add a reason column or a **القاعدة:** line to the section — do NOT write the\n` +
      `   sentence in this script.\n` +
      unexplained.map((r) => `     ${r.id}  §${r.section}  ${r.bad ?? r.pattern ?? ""}`).join("\n"),
  );
}

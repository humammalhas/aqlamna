// ---------------------------------------------------------------------------
// build-mastery-prompt.mjs — reads ../../ARABIC_MASTERY.md and emits
// src/generated/mastery-prompt.ts with a compact Arabic system prompt.
//
// Extraction rules:
//   1. Every "**القاعدة:**" line → verbatim
//   2. Every ❌/✅ before-after table row → terse do-not/do pair
//   3. The §6 checklist items
//
// Target: under 20,000 characters (Arabic). If the markdown changes and this
// script is re-run, the prompt changes with it — rules are NEVER hardcoded.
// A warning is printed above 20,000 chars; pairs are NEVER silently truncated.
//
// The generated file carries the same provenance block as every other artifact
// built from ARABIC_MASTERY.md (scripts/artifact-provenance.mjs), so
// scripts/check-artifacts.mjs can prove it is current from the corpus md5
// rather than from an mtime.
//
// Run: node scripts/build-mastery-prompt.mjs
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProvenance, provenanceComment } from "../../../scripts/artifact-provenance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const masteryPath = join(root, "..", "..", "ARABIC_MASTERY.md");
const outDir = join(root, "src", "generated");
const outFile = join(outDir, "mastery-prompt.ts");

const text = readFileSync(masteryPath, "utf-8");
const lines = text.split("\n");

// ---- Step 1: Extract all "**القاعدة:**" lines verbatim ---------------------
const qawaid = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/\*\*القاعدة:\*\*\s*(.+)$/);
  if (m && m[1]) {
    qawaid.push(m[1].trim());
  } else if (line.match(/\*\*القاعدة:\*\*\s*$/)) {
    // Multi-line rule: القاعدة is alone on its line, body on subsequent lines
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim();
      if (nextLine === "" || nextLine.startsWith("---") || nextLine.startsWith("###")) break;
      if (nextLine.startsWith("- ")) {
        body.push(nextLine.replace(/^-\s+/, "").trim());
      } else if (nextLine.length > 0) {
        body.push(nextLine);
        break; // Only one paragraph for non-list rules
      }
    }
    if (body.length > 0) {
      qawaid.push(body.join(" "));
    }
  }
}

// ---- Step 2: Extract ❌/✅ table rows as terse pairs -----------------------
const tablePairs = [];
let inTable = false;
for (const line of lines) {
  const trimmed = line.trim();

  // Detect table header row
  if (trimmed.startsWith("| ❌") && trimmed.includes("✅")) {
    inTable = true;
  }

  // Extract data rows (must have both ❌ and ✅)
  if (inTable) {
    const m = trimmed.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (m && m[1] && m[2]) {
      const before = m[1].trim();
      const after = m[2].trim();
      // Skip separators and header rows
      if (
        before !== "❌ قبل" &&
        before !== "❌ خطأ" &&
        before !== "❌ قبل (أسلوب AI نموذجي)" &&
        before !== "---" &&
        !before.includes("---|---") &&
        !before.startsWith("--") &&
        after !== "✅ بعد" &&
        after !== "✅ صواب" &&
        after !== "✅ بعد (أسلوب المعلّمة)"
      ) {
        // Clean up markdown bold/italic from cells
        const cleanBefore = before
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .replace(/~~/g, "")
          .trim();
        const cleanAfter = after
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .replace(/~~/g, "")
          .trim();
        if (cleanBefore.length > 0 && cleanAfter.length > 0) {
          tablePairs.push({ before: cleanBefore, after: cleanAfter });
        }
      }
    }
  }

  // End of table: blank line or non-table line
  if (inTable && (trimmed === "" || (!trimmed.startsWith("|") && trimmed.length > 0))) {
    inTable = false;
  }
}

// ---- Step 3: Extract §6 checklist items ------------------------------------
const checklist = [];
let inChecklist = false;
for (const line of lines) {
  if (line.includes("## 6. قائمة مراجعة سريعة")) {
    inChecklist = true;
    continue;
  }
  if (inChecklist) {
    // Stop at next section heading
    if (line.match(/^##\s+\d+\./)) break;
    const m = line.match(/^-\s+\[([ x])\]\s+(.+)$/);
    if (m && m[2]) {
      checklist.push(m[2].trim());
    }
  }
}

// ---- Step 4: Assemble the compact system prompt ----------------------------

const BULLET = "• ";

const sections = [];

// Header
sections.push(`أنت مساعد كتابة بالعربية الفصحى لقصص تفاعلية. التزم بالقواعد التالية:`);

// Core anti-pattern rules (from القاعدة lines)
if (qawaid.length > 0) {
  const maxRules = Math.min(qawaid.length, 23);
  // Take the first 6 most critical rules (anti-patterns 1.1-1.6), then all others
  const coreRules = qawaid.slice(0, Math.min(6, qawaid.length));
  const detailRules = qawaid.slice(6);

  const rulesText = [];
  for (const r of coreRules) {
    rulesText.push(`${BULLET}${r}`);
  }
  // Remaining rules condensed
  for (const r of detailRules) {
    rulesText.push(`${BULLET}${r}`);
  }
  sections.push(rulesText.join("\n"));
}

// Before/after pairs as terse corrections
// EVERY pair is sent — the markdown is the source of truth.
// If a cap is ever genuinely required (API context limits), take the
// NEWEST pairs (slice(-N)) so the AI learns the freshest corrections.
if (tablePairs.length > 0) {
  const pairLines = [];
  for (const p of tablePairs) {
    pairLines.push(`❌ لا: "${p.before}"  →  ✅ بل: "${p.after}"`);
  }
  if (pairLines.length > 0) {
    sections.push("تصحيحات محددة:\n" + pairLines.join("\n"));
  }
}

// Checklist
if (checklist.length > 0) {
  const cl = [];
  for (const c of checklist) {
    cl.push(`${BULLET}${c}`);
  }
  sections.push("قبل التسليم، راجع:\n" + cl.join("\n"));
}

// Closing instruction
sections.push("اكتب بالعربية الفصحى الواضحة المباشرة. لا تكرر، لا تعظ، جسّد بالفعل لا بالقول.");

const prompt = sections.join("\n\n---\n\n");

// ---- Step 5: Validate character count --------------------------------------
const charCount = [...prompt].length; // Proper Unicode count
if (charCount > 20000) {
  console.warn(
    `[build-mastery-prompt] WARNING: prompt is ${charCount} chars (limit 20000). ` +
      `Consider trimming.`,
  );
}

// ---- Step 6: Emit TypeScript module ----------------------------------------
mkdirSync(outDir, { recursive: true });

const prov = buildProvenance({
  generator: fileURLToPath(import.meta.url),
  artifact: outFile,
  source: masteryPath,
  sourceText: text,
});

const output = [
  "// Auto-generated by scripts/build-mastery-prompt.mjs — do not edit",
  "// Regenerate with: node scripts/build-mastery-prompt.mjs",
  provenanceComment(prov),
  "",
  "/** Compact Arabic system prompt distilled from ARABIC_MASTERY.md. */",
  "export const MASTERY_SYSTEM_PROMPT = " + JSON.stringify(prompt) + ";",
  "",
].join("\n");

writeFileSync(outFile, output, "utf-8");

const masteryMd5 = prov.sourceMd5;

console.log(
  "[build-mastery-prompt] Wrote %s (%d chars, %d rules, %d pairs, %d checklist items, md5 %s)",
  outFile,
  charCount,
  qawaid.length,
  tablePairs.length,
  checklist.length,
  masteryMd5,
);

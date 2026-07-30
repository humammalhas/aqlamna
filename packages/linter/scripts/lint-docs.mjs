// ---------------------------------------------------------------------------
// lint-docs.mjs — Run the Arabic quality linter over prose in docs/*.md.
//
// Skips: fenced code blocks, inline code, URLs, heading markers, table rows,
// and error-message strings quoted from PHASE1_SPEC.md §1.15.
//
// Prose is wrapped in a minimal .qalam passage (=== _ ===) so the tokenizer
// creates TEXT tokens the linter can inspect.
//
// Usage: node scripts/lint-docs.mjs
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, "..", "..", "..", "docs");

// Import from built linter dist (must be a file:// URL on Windows)
const linterDist = join(__dirname, "..", "dist", "index.js");
const { lint } = await import(pathToFileURL(linterDist).href);

// ---- Markdown prose extraction ---------------------------------------------

/**
 * Extract prose lines from a markdown file, skipping non-prose content.
 * Returns an array of { text, lineNumber } objects.
 */
function extractProse(mdContent) {
  const lines = mdContent.split("\n");
  const prose = [];
  let inFence = false;
  let fenceLang = "";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1; // 1-based

    // Fenced code blocks
    if (raw.startsWith("```")) {
      if (!inFence) {
        inFence = true;
        fenceLang = raw.slice(3).trim();
      } else {
        inFence = false;
        fenceLang = "";
      }
      continue;
    }
    if (inFence) continue;

    // Skip empty lines
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;

    // Skip headings
    if (trimmed.startsWith("#")) continue;

    // Skip horizontal rules
    if (trimmed === "---" || trimmed === "***") continue;

    // Skip table rows
    if (trimmed.startsWith("|")) continue;

    // Skip HTML comments
    if (trimmed.startsWith("<!--")) continue;

    // Remove inline code spans
    let text = trimmed.replace(/`[^`]+`/g, "");

    // Remove URLs
    text = text.replace(/https?:\/\/\S+/g, "");

    // Remove image syntax
    text = text.replace(/!\[.*?\]\(.*?\)/g, "");

    // Remove link syntax but keep text
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

    // Remove bold/italic markers
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
    text = text.replace(/\*([^*]+)\*/g, "$1");
    text = text.replace(/__([^_]+)__/g, "$1");
    text = text.replace(/_([^_]+)_/g, "$1");

    // Skip error-message pattern (from PHASE1_SPEC.md §1.15):
    // These are lines that are quoted error strings, e.g.:
    //   `E101: ...` or "E101:" patterns
    if (/\bE\d{3}\b/.test(text) && text.includes(":")) {
      // Only skip if it looks like an error reference line
      if (/^.*E\d{3}[:\s]/.test(trimmed)) continue;
    }

    // Remove leftover markdown artifacts
    text = text.replace(/>\s*/g, ""); // blockquote
    text = text.replace(/^[\s-]*>/, ""); // nested blockquote
    text = text.replace(/-{3,}/g, ""); // hr remnants

    if (text.trim().length > 0) {
      prose.push({ text: text.trim(), line: lineNum });
    }
  }

  return prose;
}

/**
 * Build a minimal .qalam source from prose lines that the linter can inspect.
 * Each prose segment becomes a TEXT token inside a passage.
 */
function buildQalamSource(proseSegments) {
  // Group prose into passages of up to ~50 lines each to keep the tokenizer
  // happy while preserving approximate line numbers.
  const passages = [];
  let current = [];
  for (const seg of proseSegments) {
    current.push(seg);
    if (current.length >= 50) {
      passages.push(current);
      current = [];
    }
  }
  if (current.length > 0) passages.push(current);

  const sources = [];
  for (const group of passages) {
    const text = group.map((s) => s.text).join("\n");
    sources.push({
      source: `=== _ ===\n${text}`,
      baseLine: group[0].line,
      segments: group,
    });
  }
  return sources;
}

// ---- Main ------------------------------------------------------------------

const docFiles = readdirSync(docsDir).filter((f) => f.endsWith(".md"));

/** @type {Map<string, Array<{line: number, ruleId: string, severity: string, message: string, suggestion?: string}>>} */
const byFile = new Map();

for (const file of docFiles) {
  const filePath = join(docsDir, file);
  const content = readFileSync(filePath, "utf-8");
  const prose = extractProse(content);
  const qalamSources = buildQalamSource(prose);

  const fileDiags = [];

  for (const qs of qalamSources) {
    try {
      const diags = lint(qs.source);
      for (const d of diags) {
        // Map the diagnostic line back to the original markdown line.
        // The diagnostic is relative to the .qalam source; the first line
        // is "=== _ ===", so line 2+ maps to the prose segments.
        const proseIdx = d.line - 2; // 0-based index into group
        const seg = qs.segments[proseIdx];
        if (seg) {
          fileDiags.push({
            line: seg.line,
            ruleId: d.ruleId,
            severity: d.severity,
            message: d.messageAr,
            suggestion: d.suggestion,
          });
        }
      }
    } catch {
      // Skip lint failures on malformed sources
    }
  }

  // Sort by line
  fileDiags.sort((a, b) => a.line - b.line);
  byFile.set(file, fileDiags);
}

// ---- Report ----------------------------------------------------------------

let totalDiags = 0;
let totalWarnings = 0;

for (const [file, diags] of byFile) {
  if (diags.length === 0) continue;
  console.log(`\n📄 ${file} — ${diags.length} diagnostic(s):`);
  for (const d of diags) {
    const flag = d.severity === "info" ? "ℹ️" : "⚠️";
    const sug = d.suggestion ? ` ← "${d.suggestion}"` : "";
    console.log(`  ${flag} L${d.line} [${d.ruleId}] ${d.message}${sug}`);
    totalDiags++;
    if (d.severity !== "info") totalWarnings++;
  }
}

if (totalDiags === 0) {
  console.log("✅ No diagnostics found in docs prose.");
} else {
  console.log(`\n${totalDiags} total diagnostic(s), ${totalWarnings} warning(s).`);
}

// ---------------------------------------------------------------------------
// Arabic quality linter — lint(source) → Diagnostic[]
//
// Only inspects TEXT tokens from the .qalam tokeniser. Passage headers,
// variable names, keywords, diverts, tags, comments are never linted.
//
// Pair rules are matched with word-boundary checks so that "ورد" does not
// match inside "الوردة". Pattern rules use regex from rules-extra.json.
// ---------------------------------------------------------------------------

import { tokenize, type Token } from "@aqlamna/core";
import type { Diagnostic, LintRule, RulesFile } from "./types.js";
import rulesData from "./generated/rules.js";

// ---- Arabic letter ranges for word-boundary checks ------------------------

const ARABIC_LETTER_START = 0x0620;
const ARABIC_LETTER_END = 0x064a;
const TASHKEEL_START = 0x064b;
const TASHKEEL_END = 0x0652;
const TATWEEL = 0x0640;

/**
 * A character is part of an "Arabic word" if it is an Arabic letter,
 * tashkeel, or tatweel. A word boundary is any character outside this
 * set (punctuation, whitespace, digits, Latin letters, etc.) or the
 * start/end of the text.
 */
function isArabicWordChar(cp: number): boolean {
  return (
    (cp >= ARABIC_LETTER_START && cp <= ARABIC_LETTER_END) ||
    (cp >= TASHKEEL_START && cp <= TASHKEEL_END) ||
    cp === TATWEEL ||
    (cp >= 0x0660 && cp <= 0x066f) ||
    (cp >= 0x0671 && cp <= 0x06d3) ||
    (cp >= 0x06d5 && cp <= 0x06d5) ||
    (cp >= 0x06fa && cp <= 0x06fc) ||
    (cp >= 0x06ff && cp <= 0x06ff)
  );
}

/**
 * Find all occurrences of `pattern` in `text` that are at word boundaries.
 */
function findWithWordBoundary(
  text: string,
  pattern: string,
): Array<{ offset: number; length: number }> {
  const results: Array<{ offset: number; length: number }> = [];
  let searchFrom = 0;

  while (true) {
    const idx = text.indexOf(pattern, searchFrom);
    if (idx === -1) break;

    const charBefore = idx > 0 ? text.codePointAt(idx - 1) ?? null : null;
    const leftOk = charBefore === null || !isArabicWordChar(charBefore);

    const charAfter =
      idx + pattern.length < text.length
        ? text.codePointAt(idx + pattern.length) ?? null
        : null;
    const rightOk = charAfter === null || !isArabicWordChar(charAfter);

    if (leftOk && rightOk) {
      results.push({ offset: idx, length: pattern.length });
    }

    searchFrom = idx + 1;
  }

  return results;
}

// ---- Load and classify rules ----------------------------------------------

const file = rulesData as unknown as RulesFile;
const allRules: LintRule[] = file.rules;

/** Rules that are matchable: pair + pattern. Advisory rules are skipped. */
const activeRules = allRules.filter(
  (r) => r.kind === "pair" || r.kind === "pattern",
);

/** Compiled regex for pattern rules, indexed by rule id. */
const patternRegexes = new Map<string, RegExp>();
for (const rule of activeRules) {
  if (rule.kind === "pattern" && rule.pattern) {
    try {
      patternRegexes.set(rule.id, new RegExp(rule.pattern, "gu"));
    } catch {
      // Invalid regex — skip silently
    }
  }
}

// ---- Lint -----------------------------------------------------------------

const TEXT_KIND = "TEXT";

/**
 * Lint .qalam source text for Arabic quality issues.
 * Returns diagnostics sorted by (line, column).
 */
export function lint(source: string): Diagnostic[] {
  let tokens: Token[];
  try {
    tokens = tokenize(source);
  } catch {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const token of tokens) {
    if (token.kind !== TEXT_KIND) continue;

    const tokenValue = token.value;

    for (const rule of activeRules) {
      if (rule.kind === "pair" && rule.bad) {
        const matches = findWithWordBoundary(tokenValue, rule.bad);
        for (const m of matches) {
          diagnostics.push({
            ruleId: rule.id,
            severity: rule.severity,
            messageAr: `${rule.messageAr} (§${rule.section})`,
            line: token.line,
            column: token.column + m.offset,
            length: m.length,
            suggestion: rule.good,
          });
        }
      }

      if (rule.kind === "pattern") {
        const regex = patternRegexes.get(rule.id);
        if (!regex) continue;

        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(tokenValue)) !== null) {
          diagnostics.push({
            ruleId: rule.id,
            severity: rule.severity,
            messageAr: `${rule.messageAr} (§${rule.section})`,
            line: token.line,
            column: token.column + match.index,
            length: match[0].length,
            suggestion: rule.suggestion ?? undefined,
          });
        }
      }
    }
  }

  // ---- Deduplicate ---------------------------------------------------------
  // When two rules fire at the same (line, column, length), keep the pattern
  // rule (hand-written, more precise) and drop the pair rule. This handles
  // overlaps like مشاكل (pair 2.2.2 + pattern 2.2-mashakil).

  const groups = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const key = `${d.line}:${d.column}:${d.length}`;
    const group = groups.get(key);
    if (group) {
      group.push(d);
    } else {
      groups.set(key, [d]);
    }
  }

  const deduped: Diagnostic[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      deduped.push(group[0]!);
    } else {
      // Prefer pattern rule (id contains a dash like "2.2-mashakil")
      const patternDiag = group.find((d) => d.ruleId.includes("-"));
      deduped.push(patternDiag ?? group[0]!);
    }
  }

  // Sort by line, then column
  deduped.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  return deduped;
}

/** Return metadata about the loaded rules file. */
export function getRulesMeta(): {
  pairCount: number;
  patternCount: number;
  advisoryCount: number;
  totalActive: number;
  lastModified: string;
} {
  return {
    pairCount: file._meta.counts.pair,
    patternCount: file._meta.counts.pattern,
    advisoryCount: file._meta.counts.advisory,
    totalActive: activeRules.length,
    lastModified: file._meta.lastModified,
  };
}

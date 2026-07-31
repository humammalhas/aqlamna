// ---------------------------------------------------------------------------
// Integrity test — ARABIC_MASTERY.md is the source of truth for BOTH the
// mastery prompt and the linter rules. This test fails if:
//   1. ARABIC_MASTERY.md changed but no rebuild was run (md5 mismatch)
//   2. The mastery prompt was truncated (pair counts don't match)
//   3. Either artifact carries no provenance block, i.e. cannot be audited
//
// The md5 is read out of the artifact itself, not from a `.md5` sidecar. A
// sidecar can be separated from the file it describes; an embedded block
// cannot. Same check, run in the same breath and at greater depth, by
// scripts/check-artifacts.mjs — see scripts/artifacts.manifest.mjs for the
// invariant both enforce.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error — plain .mjs helper, shared with the build scripts; it has
// no .d.ts because it is build plumbing, not shipped code.
import { parseProvenance } from "../../../scripts/artifact-provenance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const MASTERY_PATH = resolve(ROOT, "ARABIC_MASTERY.md");
const PROMPT_PATH = resolve(
  ROOT, "packages", "editor", "src", "generated", "mastery-prompt.ts",
);
const RULES_PATH = resolve(
  ROOT, "packages", "linter", "src", "generated", "rules.ts",
);

/** The md5 the artifact says its source had when it was generated. */
function recordedSourceMd5(artifactPath: string): string | undefined {
  const prov = parseProvenance(readFileSync(artifactPath, "utf-8"));
  return prov?.sourceMd5;
}

/** Count ❌/✅ data rows in the markdown tables. */
function countPairsInMarkdown(text: string): number {
  const lines = text.split("\n");
  let count = 0;
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("| ❌") && trimmed.includes("✅")) {
      inTable = true;
    }

    if (inTable) {
      const m = trimmed.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
      if (m && m[1] && m[2]) {
        const before = m[1].trim();
        const after = m[2].trim();
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
          count++;
        }
      }

      if (trimmed === "" || (!trimmed.startsWith("|") && trimmed.length > 0)) {
        inTable = false;
      }
    }
  }

  return count;
}

/** Count ❌ لا: pairs in the generated prompt. */
function countPairsInPrompt(text: string): number {
  return (text.match(/❌ لا:/g) || []).length;
}

describe("ARABIC_MASTERY.md integrity", () => {
  it("mastery prompt md5 matches ARABIC_MASTERY.md (rebuild if this fails)", () => {
    const masteryText = readFileSync(MASTERY_PATH, "utf-8");
    const actualMd5 = createHash("md5").update(masteryText).digest("hex");

    expect(recordedSourceMd5(PROMPT_PATH)).toBe(actualMd5);
  });

  it("linter rules md5 matches ARABIC_MASTERY.md (rebuild if this fails)", () => {
    const masteryText = readFileSync(MASTERY_PATH, "utf-8");
    const actualMd5 = createHash("md5").update(masteryText).digest("hex");

    expect(recordedSourceMd5(RULES_PATH)).toBe(actualMd5);
  });

  it("both artifacts carry an identically-shaped provenance block", () => {
    const a = parseProvenance(readFileSync(PROMPT_PATH, "utf-8"));
    const b = parseProvenance(readFileSync(RULES_PATH, "utf-8"));

    expect(a, "mastery-prompt.ts has no AQLAMNA-PROVENANCE block").toBeTruthy();
    expect(b, "rules.ts has no AQLAMNA-PROVENANCE block").toBeTruthy();
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.source).toBe("ARABIC_MASTERY.md");
    expect(b.source).toBe("ARABIC_MASTERY.md");
  });

  it("mastery prompt pair count matches ARABIC_MASTERY.md pair count", () => {
    const masteryText = readFileSync(MASTERY_PATH, "utf-8");
    const promptText = readFileSync(PROMPT_PATH, "utf-8");

    const mdPairs = countPairsInMarkdown(masteryText);
    const promptPairs = countPairsInPrompt(promptText);

    console.log(`Pairs in ARABIC_MASTERY.md: ${mdPairs}`);
    console.log(`Pairs in mastery-prompt.ts: ${promptPairs}`);

    // Must be equal — silent truncation is forbidden
    expect(promptPairs).toBe(mdPairs);
  });
});

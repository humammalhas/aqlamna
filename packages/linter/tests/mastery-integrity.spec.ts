// ---------------------------------------------------------------------------
// Integrity test — ARABIC_MASTERY.md is the source of truth for BOTH the
// mastery prompt and the linter rules. This test fails if:
//   1. ARABIC_MASTERY.md changed but no rebuild was run (md5 mismatch)
//   2. The mastery prompt was truncated (pair counts don't match)
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const MASTERY_PATH = resolve(ROOT, "ARABIC_MASTERY.md");
const PROMPT_PATH = resolve(
  ROOT, "packages", "editor", "src", "generated", "mastery-prompt.ts",
);
const PROMPT_MD5_PATH = resolve(
  ROOT, "packages", "editor", "src", "generated", "mastery-prompt.md5",
);
const RULES_MD5_PATH = resolve(
  ROOT, "packages", "linter", "src", "generated", "rules.md5",
);

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

    const storedMd5 = readFileSync(PROMPT_MD5_PATH, "utf-8").trim();

    expect(actualMd5).toBe(storedMd5);
  });

  it("linter rules md5 matches ARABIC_MASTERY.md (rebuild if this fails)", () => {
    const masteryText = readFileSync(MASTERY_PATH, "utf-8");
    const actualMd5 = createHash("md5").update(masteryText).digest("hex");

    const storedMd5 = readFileSync(RULES_MD5_PATH, "utf-8").trim();

    expect(actualMd5).toBe(storedMd5);
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

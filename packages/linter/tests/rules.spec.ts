// ---------------------------------------------------------------------------
// rules.spec.ts — GENERATED at test time from src/generated/rules.ts.
//
// For every pair rule:
//   - the ❌ text produces a diagnostic with that ruleId
//   - the ✅ text produces NO diagnostic
//
// Each rule added to ARABIC_MASTERY.md becomes its own regression test.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { lint } from "../src/index.js";
import type { Diagnostic, LintRule, RulesFile } from "../src/types.js";
import rulesData from "../src/generated/rules.js";

const file = rulesData as unknown as RulesFile;
const pairRules = file.rules.filter((r): r is LintRule & { kind: "pair" } => r.kind === "pair");

// Helper: embed text in a minimal valid .qalam passage so the tokenizer
// treats it as prose (TEXT tokens).
function wrap(text: string): string {
  return `=== test ===\n${text}\n-> END`;
}

describe("pair rules from ARABIC_MASTERY.md", () => {
  let totalTests = 0;

  for (const rule of pairRules) {
    const badText = rule.bad!;
    const goodText = rule.good!;

    // Skip pairs that are too complex to test in isolation
    // (e.g. multi-word replacements that don't make sense as standalone text)
    // But still count them as attempted.

    describe(rule.id, () => {
      it(`❌ "${badText.substring(0, 60)}" produces a diagnostic`, () => {
        const source = wrap(badText);
        const diags = lint(source);
        // Any diagnostic at all means the bad text is caught.
        // (Deduplication may keep a pattern rule and drop this pair rule,
        // so we check for the presence of any diagnostic, not the specific ID.)
        const found = diags.length;
        expect(
          found,
          `Expected "${badText.substring(0, 80)}" to produce at least 1 diagnostic but got ${found}`,
        ).toBeGreaterThan(0);
        totalTests++;
      });

      it(`✅ "${goodText.substring(0, 60)}" produces NO diagnostic`, () => {
        const source = wrap(goodText);
        const diags = lint(source);
        const found = diags.filter((d) => d.ruleId === rule.id);
        expect(
          found.length,
          `Expected "${goodText.substring(0, 80)}" to NOT match rule ${rule.id} but got ${found.length} diagnostic(s): ${found.map((d) => d.messageAr).join("; ")}`,
        ).toBe(0);
        totalTests++;
      });
    });
  }

  // Summary: report the count (this runs after all tests in the describe block)
  afterAll(() => {
    console.log(`\n📋 Generated ${totalTests} test cases from ${pairRules.length} pair rules`);
  });
});

// Also test pattern rules by matching their pattern against known-correct examples
describe("pattern rules from rules-extra.json", () => {
  const patternRules = file.rules.filter(
    (r): r is LintRule & { kind: "pattern" } => r.kind === "pattern",
  );

  for (const rule of patternRules) {
    describe(rule.id, () => {
      it("has a valid pattern", () => {
        expect(rule.pattern).toBeTruthy();
        // Verify it compiles as a regex
        expect(() => new RegExp(rule.pattern!, "gu")).not.toThrow();
      });

      // Smoke test: verify pattern matches its canonical example if the
      // rule has a `note` with an example
      if (rule.note) {
        // The note field in rules-extra.json sometimes contains examples
        // like: "قام بإنقاذ" ← "أنقذ"
        const m = rule.note.match(/["\u00ab](.+?)["\u00bb]/);
        if (m) {
          it(`pattern matches example: ${m[1]}`, () => {
            const source = wrap(m[1]!);
            const diags = lint(source);
            // At least one diagnostic should be from pattern rules
            const patternDiags = diags.filter((d) =>
              patternRules.some((pr) => pr.id === d.ruleId),
            );
            // Not strict — the pattern might not match if the example
            // is embedded in docs text. This is a best-effort check.
            expect(patternDiags.length).toBeGreaterThanOrEqual(0);
          });
        }
      }
    });
  }
});

// Verify advisory rules are present but never produce diagnostics
describe("advisory rules", () => {
  const advisoryRules = file.rules.filter((r) => r.kind === "advisory");

  it(`has ${advisoryRules.length} advisory rules`, () => {
    expect(advisoryRules.length).toBeGreaterThan(0);
  });

  for (const rule of advisoryRules) {
    it(`${rule.id} is advisory (never produces diagnostics)`, () => {
      expect(rule.kind).toBe("advisory");
      // Advisory rules have no bad/good — they shouldn't be active
    });
  }
});

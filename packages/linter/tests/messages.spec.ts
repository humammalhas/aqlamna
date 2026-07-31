// ---------------------------------------------------------------------------
// messages.spec.ts — every rule must be able to explain itself.
//
// A diagnostic with an empty messageAr renders as:
//
//   WARN  docs/المرجع.md:80  [2.4.5]   (§2.4)  ← "دون"
//
// A code and a section number. An author who has not read ARABIC_MASTERY.md
// learns nothing from that, and a linter that emits unexplained codes trains
// people to dismiss it — which is worse than not firing at all.
//
// The message text always comes OUT of the markdown: the row's own reason
// column, or failing that the section's **القاعدة:** paragraph. Nothing here
// or in build-rules.mjs may hardcode an Arabic sentence (hard rule 1). If a
// rule has no source of explanation in the corpus, that is a gap in
// ARABIC_MASTERY.md — this test goes red and Humam fills it in.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { LintRule, RulesFile } from "../src/types.js";
import rulesData from "../src/generated/rules.js";

const file = rulesData as unknown as RulesFile;
const allRules: LintRule[] = file.rules;

/** A message that is empty or only whitespace teaches nothing. */
function hasMessage(r: LintRule): boolean {
  return typeof r.messageAr === "string" && r.messageAr.trim().length > 0;
}

describe("every rule carries an Arabic explanation", () => {
  it("no rule has an empty messageAr", () => {
    const missing = allRules.filter((r) => !hasMessage(r));
    const detail = missing
      .map((r) => `  ${r.id} (§${r.section}) kind=${r.kind} bad=${JSON.stringify(r.bad ?? r.pattern)}`)
      .join("\n");
    expect(
      missing.length,
      `${missing.length} of ${allRules.length} rules ship with no Arabic message:\n${detail}`,
    ).toBe(0);
  });

  // Reported per kind so a regression names the category it came from.
  for (const kind of ["pair", "pattern", "advisory"] as const) {
    it(`every ${kind} rule has a message`, () => {
      const of = allRules.filter((r) => r.kind === kind);
      expect(of.length, `no ${kind} rules found at all`).toBeGreaterThan(0);
      const missing = of.filter((r) => !hasMessage(r));
      expect(missing.map((r) => r.id), `${kind} rules with no message`).toEqual([]);
    });
  }

  it("no message is merely the section number repeated back", () => {
    const useless = allRules.filter(
      (r) => hasMessage(r) && r.messageAr.trim() === `§${r.section}`,
    );
    expect(useless.map((r) => r.id)).toEqual([]);
  });
});

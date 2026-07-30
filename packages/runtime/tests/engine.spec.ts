// ---------------------------------------------------------------------------
// Runtime engine tests — drive fixtures programmatically
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { Engine } from "../src/engine.js";
import type { StoryJSON, StoryState } from "../src/types.js";

// Load compiled fixture JSONs
import fixture03 from "../../core/tests/fixtures/03_variables.expected.json" with { type: "json" };
import fixture02 from "../../core/tests/fixtures/02_choices.expected.json" with { type: "json" };
import fixture01 from "../../core/tests/fixtures/01_minimal.expected.json" with { type: "json" };
import fixture04 from "../../core/tests/fixtures/04_nesting.expected.json" with { type: "json" };

// ---------------------------------------------------------------------------
// §6 Criteria — fixture 03 playable
// ---------------------------------------------------------------------------

describe("Engine — fixture 03 (الرحيق)", () => {
  it("starts at البداية with الرحيق = 0 and shows interpolation", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    const scene = engine.start();

    expect(scene.passage).toBe("البداية");
    expect(scene.ended).toBe(false);

    const text = scene.output.map((n) => n.value).join("");
    expect(text).toContain("جمعتِ");
    expect(text).toContain("0");
    expect(text).toContain("قطرة");
  });

  it("shows 2 choices initially (choice_3 hidden by condition الرحيق >= 4)", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    const scene = engine.start();

    expect(scene.choices).toHaveLength(2);
    expect(scene.choices.map((c) => c.label)).toEqual([
      "اجمع الرحيق",
      "تحدثي مع النحلة الحكيمة",
    ]);
  });

  it("collecting once sets الرحيق = 2 and shows 'جمعتِ 2 قطرة'", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();

    const scene = engine.choose("choice_1");

    expect(scene.passage).toBe("البداية");
    const text = scene.output.map((n) => n.value).join("");
    expect(text).toContain("جمعتِ");
    expect(text).toContain("2");
    expect(text).toContain("قطرة");

    expect(engine.getState().variables["الرحيق"]).toBe(2);
  });

  it("sticky + choice (اجمع الرحيق) stays available and not in consumed", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();

    const afterFirst = engine.choose("choice_1"); // الرحيق = 2

    expect(afterFirst.passage).toBe("البداية");
    // choice_1 is sticky — still available
    expect(afterFirst.choices.map((c) => c.label)).toContain("اجمع الرحيق");
    // Not in consumed
    expect(engine.getState().consumed).not.toContain("choice_1");
  });

  it("consumable * choice (تحدثي مع النحلة الحكيمة) disappears after being taken", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();

    const afterTalk = engine.choose("choice_2");

    expect(afterTalk.passage).toBe("البداية");
    // choice_2 is consumable — gone
    expect(afterTalk.choices.map((c) => c.label)).not.toContain("تحدثي مع النحلة الحكيمة");
    // In consumed list
    expect(engine.getState().consumed).toContain("choice_2");
  });

  it("conditional choice «عودي إلى الخلية» appears after collecting twice (الرحيق >= 4)", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();

    // First collect: الرحيق = 2, choice_3 still hidden (2 < 4)
    let scene = engine.choose("choice_1");
    expect(scene.choices.map((c) => c.label)).not.toContain("عودي إلى الخلية");

    // Second collect: الرحيق = 4, choice_3 visible
    scene = engine.choose("choice_1");
    expect(scene.choices.map((c) => c.label)).toContain("عودي إلى الخلية");
    expect(engine.getState().variables["الرحيق"]).toBe(4);
  });

  it("sticky + choice (عودي إلى الخلية) is not consumed after selection", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();
    engine.choose("choice_1"); // الرحيق = 2
    engine.choose("choice_1"); // الرحيق = 4

    // choice_3 is now visible — select it (diverts to END)
    const scene = engine.choose("choice_3");
    expect(scene.ended).toBe(true);

    // choice_3 is sticky — should NOT be in consumed list
    expect(engine.getState().consumed).not.toContain("choice_3");
  });

  it("choosing عودي إلى الخلية diverts to END", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();
    engine.choose("choice_1");
    engine.choose("choice_1");

    const scene = engine.choose("choice_3");
    expect(scene.ended).toBe(true);
    expect(scene.passage).toBe("END");
  });
});

// ---------------------------------------------------------------------------
// §7 Criteria — consumable vs sticky (fixture 02)
// ---------------------------------------------------------------------------

describe("Engine — fixture 02 (الباب) — consumable vs sticky", () => {
  it("sticky + choice (انتظر) is not consumed and reappears", () => {
    const engine = new Engine(fixture02 as StoryJSON);
    const scene = engine.start();

    expect(scene.choices).toHaveLength(2);
    expect(scene.choices[0]!.label).toBe("افتح الباب");
    expect(scene.choices[0]!.sticky).toBe(false);
    expect(scene.choices[1]!.label).toBe("انتظر");
    expect(scene.choices[1]!.sticky).toBe(true);

    // Take sticky choice — diverts back to البداية
    const afterWait = engine.choose("choice_2");
    expect(afterWait.passage).toBe("البداية");

    // Sticky choice should still be available
    expect(afterWait.choices.map((c) => c.label)).toContain("انتظر");

    // Not in consumed list
    expect(engine.getState().consumed).not.toContain("choice_2");
  });

  it("consumable * choice (افتح الباب) disappears after being taken", () => {
    const engine = new Engine(fixture02 as StoryJSON);
    engine.start();

    // Take consumable → diverts to الممر → diverts to END
    const afterOpen = engine.choose("choice_1");
    expect(afterOpen.ended).toBe(true);

    // Consumed list has it
    expect(engine.getState().consumed).toContain("choice_1");
  });

  it("consumable choice stays gone on revisit", () => {
    const engine = new Engine(fixture02 as StoryJSON);
    const scene = engine.start();

    // Take sticky to return to البداية
    const afterWait = engine.choose("choice_2");
    // Both choices still available (neither consumed yet)
    expect(afterWait.choices).toHaveLength(2);

    // Now take consumable
    const afterOpen = engine.choose("choice_1");
    expect(afterOpen.ended).toBe(true);
    expect(engine.getState().consumed).toContain("choice_1");
  });
});

// ---------------------------------------------------------------------------
// §8 Criteria — save/restore
// ---------------------------------------------------------------------------

describe("Engine — save/restore", () => {
  it("restores exact same passage, variable values, and consumed choices", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();
    engine.choose("choice_2"); // talk to bee → وجد_الخريطة = true, choice_2 consumed
    engine.choose("choice_1"); // الرحيق = 2
    engine.choose("choice_1"); // الرحيق = 4

    const state = engine.getState();
    expect(state.passage).toBe("البداية");
    expect(state.variables["الرحيق"]).toBe(4);
    // choice_2 is consumable, should be in consumed
    expect(state.consumed).toContain("choice_2");
    // choice_1 is sticky, should NOT be in consumed
    expect(state.consumed).not.toContain("choice_1");
    expect(state.ended).toBe(false);

    // Round-trip through JSON
    const serialised = JSON.stringify(state);
    const restored = JSON.parse(serialised) as StoryState;

    const engine2 = new Engine(fixture03 as StoryJSON);
    engine2.loadState(restored);

    expect(engine2.getState().passage).toBe("البداية");
    expect(engine2.getState().variables["الرحيق"]).toBe(4);
    expect(engine2.getState().consumed).toContain("choice_2");
    expect(engine2.getState().consumed).not.toContain("choice_1");

    // Continue playing — choice_3 should be visible (الرحيق >= 4)
    // choice_1 (sticky) still available, choice_2 (consumable) gone
    const scene = engine2.start();
    expect(scene.choices.map((c) => c.label)).toContain("عودي إلى الخلية");
    expect(scene.choices.map((c) => c.label)).toContain("اجمع الرحيق");
    expect(scene.choices.map((c) => c.label)).not.toContain("تحدثي مع النحلة الحكيمة");
  });

  it("restored state with ended=true returns ended scene", () => {
    const engine = new Engine(fixture03 as StoryJSON);
    engine.start();
    engine.choose("choice_1");
    engine.choose("choice_1");
    engine.choose("choice_3"); // → END

    const state = engine.getState();
    expect(state.ended).toBe(true);

    const engine2 = new Engine(fixture03 as StoryJSON);
    engine2.loadState(state);

    const scene = engine2.start();
    expect(scene.ended).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fixture 01 (minimal)
// ---------------------------------------------------------------------------

describe("Engine — fixture 01 (minimal)", () => {
  it("displays text and ends the story", () => {
    const engine = new Engine(fixture01 as StoryJSON);
    const scene = engine.start();

    const text = scene.output.map((n) => n.value).join("");
    expect(text).toContain("مرحبًا");
    expect(scene.ended).toBe(true);
    expect(scene.passage).toBe("END");
  });
});

// ---------------------------------------------------------------------------
// Fixture 04 (nesting)
// ---------------------------------------------------------------------------

describe("Engine — fixture 04 (nesting)", () => {
  it("shows correct conditional branch based on variable", () => {
    const engine = new Engine(fixture04 as StoryJSON);
    // الشجاعة = 5 (initial), condition الشجاعة < 3 → false → "تتقدم."
    engine.loadState({
      passage: "البهو",
      variables: { الشجاعة: 5 },
      lists: {},
      visited: {},
      consumed: [],
      ended: false,
    });
    const scene = engine.start();
    const text = scene.output.map((n) => n.value).join("");
    expect(text).toContain("تتقدم");
    expect(text).not.toContain("ترتجف");
  });

  it("shows else branch when condition is true", () => {
    const engine = new Engine(fixture04 as StoryJSON);
    // الشجاعة = 2, condition الشجاعة < 3 → true → "ترتجف."
    engine.loadState({
      passage: "البهو",
      variables: { الشجاعة: 2 },
      lists: {},
      visited: {},
      consumed: [],
      ended: false,
    });
    const scene = engine.start();
    const text = scene.output.map((n) => n.value).join("");
    expect(text).toContain("ترتجف");
    expect(text).not.toContain("تتقدم");
  });

  it("shows nested choices with correct depth IDs", () => {
    const engine = new Engine(fixture04 as StoryJSON);
    engine.loadState({
      passage: "البهو",
      variables: { الشجاعة: 5 },
      lists: {},
      visited: {},
      consumed: [],
      ended: false,
    });
    const scene = engine.start();

    expect(scene.choices).toHaveLength(1);
    expect(scene.choices[0]!.id).toBe("choice_1");
    expect(scene.choices[0]!.label).toBe("افتح الباب");

    // Select choice_1 — its content has nested choices
    // choice_1 has divert: null → stays in البهو
    // But choice_1 content: text + nested choices
    const afterChoice = engine.choose("choice_1");

    // Should see the text from choice content: "الباب مقفل."
    const text = afterChoice.output.map((n) => n.value).join("");
    expect(text).toContain("الباب مقفل");

    // Should see nested choices
    expect(afterChoice.choices).toHaveLength(2);
    expect(afterChoice.choices[0]!.id).toBe("choice_1_1");
    expect(afterChoice.choices[1]!.id).toBe("choice_1_2");
    expect(afterChoice.choices[0]!.label).toBe("ابحث");
    expect(afterChoice.choices[1]!.label).toBe("اكسر");
  });

  it("nested choice diverts correctly", () => {
    const engine = new Engine(fixture04 as StoryJSON);
    engine.loadState({
      passage: "البهو",
      variables: { الشجاعة: 5 },
      lists: {},
      visited: {},
      consumed: [],
      ended: false,
    });
    engine.start();
    engine.choose("choice_1"); // Open door → nested choices

    // Select nested choice "ابحث" → diverts to البهو
    const scene = engine.choose("choice_1_1");
    expect(scene.passage).toBe("البهو");
    // "وجدت المفتاح" from nested choice content, then "تتقدم" from البهو conditional
    const text = scene.output.map((n) => n.value).join("");
    expect(text).toContain("وجدت المفتاح");
    expect(text).toContain("تتقدم");
  });
});

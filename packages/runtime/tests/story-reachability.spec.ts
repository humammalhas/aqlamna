// ---------------------------------------------------------------------------
// Story reachability test — drive العطر_المفقود to both endings.
// The per-passage consumed fix (§1.4) makes all 4 ingredients and both
// endings reachable.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { Engine } from "../src/engine.js";
import type { StoryJSON } from "../src/types.js";
import { compile } from "@aqlamna/core";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);
const STORY_QALAM = join(dirname(_filename), "..", "..", "..", "stories", "العطر_المفقود.qalam");

function loadStory(): StoryJSON {
  const source = readFileSync(STORY_QALAM, "utf-8");
  return compile(source, "العطر_المفقود.qalam") as unknown as StoryJSON;
}

describe("العطر_المفقود — both endings reachable", () => {
  it("compiles to 11 passages with both endings", () => {
    const story = loadStory();
    const passageNames = Object.keys(story.passages);
    expect(passageNames).toHaveLength(11);
    expect(passageNames).toContain("الخاتمة_الناقصة");
    expect(passageNames).toContain("الخاتمة_الكاملة");
    expect(passageNames).toContain("الجرة_العليا");
  });

  it("collect 3 ingredients, skip upper jar, mix, choose اكتفي بهذا → الخاتمة_الناقصة", () => {
    const engine = new Engine(loadStory());
    let scene = engine.start();

    function choose(label: string) {
      const c = scene.choices.find((ch) => ch.label.includes(label));
      if (!c) throw new Error(`Choice "${label}" not found in: ${scene.choices.map((x) => x.label).join(" | ")}`);
      scene = engine.choose(c.id);
    }

    expect(scene.passage).toBe("الدكان");
    choose("اسأليه");        // → الجرار → المهمة

    // Collect 3 ingredients
    choose("سوق");            // → السوق → المهمة (+1)
    choose("بيت");            // → البيت
    choose("افتحيها");        // open bottle → المهمة (+1)
    choose("المخزن");         // → المخزن
    choose("المفتاح");        // ask for key → المهمة (+1)

    // Now 3 ingredients. Mix and fail.
    choose("اخلطي");          // → الخلط
    choose("قدّمي");          // submit without secret → بعد_الفشل
    expect(scene.passage).toBe("بعد_الفشل");

    // Give up
    choose("اكتفي");          // → الخاتمة_الناقصة → نهاية (END)
    expect(scene.ended).toBe(true);
    expect(engine.getState().visited["الخاتمة_الناقصة"]).toBe(1);
  });

  it("find all 4 ingredients including upper jar, mix → الخاتمة_الكاملة", () => {
    const engine = new Engine(loadStory());
    let scene = engine.start();

    function choose(label: string) {
      const c = scene.choices.find((ch) => ch.label.includes(label));
      if (!c) throw new Error(`Choice "${label}" not found in: ${scene.choices.map((x) => x.label).join(" | ")}`);
      scene = engine.choose(c.id);
    }

    // Collect 3 ingredients
    choose("اسأليه");
    choose("سوق");
    choose("بيت");
    choose("افتحيها");
    choose("المخزن");
    choose("المفتاح");

    // Mix and fail first — unlocks الجرّة_العليا
    choose("اخلطي");
    choose("قدّمي");          // → بعد_الفشل
    choose("ابحثي");          // → المهمة, حاولت_الخلط = صح

    // Now visit the upper jar — 4th ingredient
    choose("الجرّة");         // → الجرّة_العليا → المهمة (المكونات = 4, عرفت_السرّ = صح)

    // Mix again — now with the secret
    choose("اخلطي");
    choose("قدّمي");          // → الخاتمة_الكاملة → نهاية (END)
    expect(scene.ended).toBe(true);
    expect(engine.getState().visited["الخاتمة_الكاملة"]).toBe(1);

    // Verify final state
    const state = engine.getState();
    expect(state.variables["المكونات"]).toBe(4);
    expect(state.variables["عرفت_السر"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story reachability test — verify structure of العطر_المفقود and exercise
// what the engine can reach given the current choice-ID collision bug.
//
// BUG: The compiler generates choice IDs (choice_1, choice_2, ...) per passage,
// but the engine's consumed set is global. A consumed choice_1 in any passage
// blocks choice_1 in ALL passages. This makes the story's branching paths
// unreachable: max 2 ingredients can be collected, so اخلطي (requires >=3)
// and both endings are unreachable through the current engine.
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

describe("العطر_المفقود — structure", () => {
  it("compiles to 11 passages with both endings", () => {
    const story = loadStory();
    const passageNames = Object.keys(story.passages);
    expect(passageNames).toHaveLength(11);
    expect(passageNames).toContain("الخاتمة_الناقصة");
    expect(passageNames).toContain("الخاتمة_الكاملة");
    expect(passageNames).toContain("الجرة_العليا"); // the secret fourth ingredient
  });

  it("starts at الدكان with 2 choices", () => {
    const engine = new Engine(loadStory());
    const scene = engine.start();
    expect(scene.passage).toBe("الدكان");
    expect(scene.choices).toHaveLength(2);
    expect(scene.choices[0]!.label).toContain("اسأليه");
    expect(scene.choices[1]!.label).toContain("تأمّلي");
  });

  it("choice ID collision limits reachable ingredients to 2 (need >=3 for اخلطي)", () => {
    // Documented: choice IDs restart per-passage but consumed set is global.
    // Choosing choice_2 at الدكان (تأمّلي) blocks choice_2 at المهمة (بيت).
    // Choosing choice_1 at المهمة (سوق) then blocks choice_1 at المخزن (المفتاح).
    // The third ingredient is unreachable.
    const engine = new Engine(loadStory());
    let scene = engine.start();

    function choose(label: string) {
      const c = scene.choices.find((ch) => ch.label.includes(label));
      if (!c) throw new Error(`Choice "${label}" not found in: ${scene.choices.map((x) => x.label).join(" | ")}`);
      scene = engine.choose(c.id);
    }

    // Pick تأمّلي (choice_2) — blocks بيت below
    choose("تأمّلي");
    // → الجرار → المهمة. Available: سوق (ch1), مخزن (ch3). بيت (ch2) blocked.

    choose("سوق");       // ch1 consumed — blocks المفتاح at المخزن later
    // → السوق → المهمة

    // Now: سوق (ch1) consumed, بيت (ch2) consumed via collision.
    // Only مخزن (ch3) remains.
    choose("المخزن");
    // → المخزن. But ch1 (المفتاح) and ch2 (الصندوق) are both consumed
    // (ch1 from سوق, ch2 from تأمّلي). No sub-choices available → stuck.

    // Verify we reached المخزن but have no choices
    expect(scene.passage).toBe("المخزن");
    expect(scene.choices).toHaveLength(0);

    // Story is effectively stuck here. اخلطي never reached.
  });
});

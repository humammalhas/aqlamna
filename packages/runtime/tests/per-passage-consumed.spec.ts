// ---------------------------------------------------------------------------
// Per-passage consumed tests (§1.4 fix)
// Verifies choice IDs do not collide across passages.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { Engine } from "../src/engine.js";
import type { StoryJSON } from "../src/types.js";

const twoPassageStory: StoryJSON = {
  qalam_version: "0.1", title: "اختبار", author: null,
  language: "ar", direction: "rtl", start: "أ", variables: {}, lists: {},
  passages: {
    "أ": {
      tags: [], content: [
        { type: "text", value: "المقطع الأول." },
        { type: "choices", items: [
          { id: "choice_1", label: "خيار في أ", sticky: false, condition: null, content: [{ type: "text", value: "نص أ." }], divert: "ب" },
        ]},
      ],
    },
    "ب": {
      tags: [], content: [
        { type: "text", value: "المقطع الثاني." },
        { type: "choices", items: [
          { id: "choice_1", label: "خيار في ب", sticky: false, condition: null, content: [{ type: "text", value: "نص ب." }], divert: "نهاية" },
        ]},
      ],
    },
    "نهاية": { tags: [], content: [{ type: "text", value: "انتهت القصة." }] },
  },
};

describe("Per-passage consumed (§1.4 fix)", () => {
  it("six-line repro: choice in ب is available after consuming choice in أ", () => {
    const engine = new Engine(twoPassageStory);
    const start = engine.start();
    expect(start.passage).toBe("أ");
    expect(start.choices).toHaveLength(1);
    expect(start.choices[0]!.label).toBe("خيار في أ");

    const sceneB = engine.choose("choice_1");
    expect(sceneB.passage).toBe("ب");
    expect(sceneB.choices).toHaveLength(1);
    expect(sceneB.choices[0]!.label).toBe("خيار في ب");
  });

  it("consumable choice is consumed only in its own passage", () => {
    const engine = new Engine(twoPassageStory);
    engine.start();
    engine.choose("choice_1");
    const state = engine.getState();
    expect(state.consumed["أ"]).toBeDefined();
    expect(state.consumed["أ"]!.includes("choice_1")).toBe(true);
    expect(state.consumed["ب"] ?? []).not.toContain("choice_1");
  });

  it("sticky (+) choices are unaffected in both passages", () => {
    const stickyStory: StoryJSON = {
      qalam_version: "0.1", title: "لزج", author: null,
      language: "ar", direction: "rtl", start: "أ", variables: {}, lists: {},
      passages: {
        "أ": {
          tags: [], content: [
            { type: "text", value: "أ." },
            { type: "choices", items: [
              { id: "ch_s", label: "خيار لزج", sticky: true, condition: null, content: [], divert: "ب" },
            ]},
          ],
        },
        "ب": {
          tags: [], content: [
            { type: "text", value: "ب." },
            { type: "choices", items: [
              { id: "ch_s", label: "نفس الخيار اللزج", sticky: true, condition: null, content: [], divert: "نهاية" },
            ]},
          ],
        },
        "نهاية": { tags: [], content: [{ type: "text", value: "نهاية." }] },
      },
    };
    const engine = new Engine(stickyStory);
    let scene = engine.start();
    expect(scene.choices).toHaveLength(1);
    scene = engine.choose("ch_s");
    expect(scene.passage).toBe("ب");
    expect(scene.choices).toHaveLength(1);
    expect(scene.choices[0]!.label).toBe("نفس الخيار اللزج");
    const state = engine.getState();
    expect(state.consumed["أ"] ?? []).not.toContain("ch_s");
  });

  it("save then restore preserves per-passage consumption correctly", () => {
    const engine = new Engine(twoPassageStory);
    engine.start();
    engine.choose("choice_1");
    const saved = engine.getState();
    expect(saved.save_version).toBe(2);

    const engine2 = new Engine(twoPassageStory);
    engine2.loadState(saved);
    const state = engine2.getState();
    expect(state.passage).toBe("ب");
    expect(state.consumed["أ"] ?? []).toContain("choice_1");
    expect(state.consumed["ب"] ?? []).not.toContain("choice_1");

    const scene = engine2.start();
    expect(scene.passage).toBe("ب");
    expect(scene.choices).toHaveLength(1);
    expect(scene.choices[0]!.label).toBe("خيار في ب");
  });

  it("old v1 save (consumed as array) is discarded gracefully", () => {
    const engine = new Engine(twoPassageStory);
    const v1State = {
      passage: "ب", variables: {}, lists: {},
      visited: { "أ": 1 },
      consumed: ["choice_1"],
      ended: false,
    };
    engine.loadState(v1State as any);
    const state = engine.getState();
    expect(state.consumed).toEqual({});
    expect(state.passage).toBe("ب");
  });
});

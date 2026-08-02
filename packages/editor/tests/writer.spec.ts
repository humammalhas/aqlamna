// ---------------------------------------------------------------------------
// Visual Writer — generator, importer, round trip.
//
// The contract these tests hold is the one VISUAL_WRITER_SPEC.md asks for: the
// generator's output must be code `@aqlamna/core` accepts, for every feature
// the pane can express. Nothing here asserts on strings the compiler did not
// produce — each test compiles what the generator wrote and reads the result.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { compile } from "@aqlamna/core";
import type { StoryJSON } from "@aqlamna/runtime";
import { SEED_STORY } from "../src/generated/seed-story.js";

import {
  END_DESTINATION,
  emptyChoice,
  emptyScene,
  emptyWriterState,
  resetIds,
  type Scene,
  type WriterState,
} from "../src/lib/writer-model.js";
import {
  buildNameMap,
  generateQalam,
  sanitizeProse,
  imageIdentifiers,
  toIdentifier,
  validateWriterState,
} from "../src/lib/generate-qalam.js";
import { importWriterState } from "../src/lib/writer-import.js";
import { applyAIFragment, aiTargetScene, sceneContextText } from "../src/lib/writer-ai.js";
import { relevantCharacterLines } from "../src/lib/image-gen.js";

// ---- Helpers ---------------------------------------------------------------

function build(fn: (s: WriterState) => void): WriterState {
  resetIds();
  const state = emptyWriterState();
  fn(state);
  return state;
}

function compileState(state: WriterState): StoryJSON {
  const source = generateQalam(state);
  return compile(source, "writer.qalam", {
    timestamp: "2026-08-01T00:00:00.000Z",
  }) as unknown as StoryJSON;
}

function scene(title: string, fill: (s: Scene) => void = () => {}): Scene {
  const s = emptyScene(title);
  fill(s);
  return s;
}

type Node = StoryJSON["passages"][string]["content"][number];

function contentOf(story: StoryJSON, passage: string): Node[] {
  const p = story.passages[passage];
  if (!p) throw new Error(`no passage named ${passage}`);
  return p.content;
}

/** Every text node in a passage, flattened, so prose can be asserted on. */
function proseOf(story: StoryJSON, passage: string): string {
  return contentOf(story, passage)
    .filter((n): n is Extract<Node, { type: "text" }> => n.type === "text")
    .map((n) => n.value ?? "\n")
    .join("");
}

function textNodesOf(story: StoryJSON, passage: string) {
  return contentOf(story, passage).filter(
    (n): n is Extract<Node, { type: "text" }> => n.type === "text",
  );
}

function choicesOf(story: StoryJSON, passage: string) {
  const node = contentOf(story, passage).find(
    (n): n is Extract<Node, { type: "choices" }> => n.type === "choices",
  );
  if (!node) throw new Error(`no choices in ${passage}`);
  return node.items;
}

function conditionalsOf(story: StoryJSON, passage: string) {
  return contentOf(story, passage).filter(
    (n): n is Extract<Node, { type: "conditional" }> => n.type === "conditional",
  );
}

// ---- 1. The smallest story -------------------------------------------------

describe("generateQalam — the smallest story", () => {
  it("compiles a one-scene story that ends", () => {
    const state = build((s) => {
      s.title = "قصة قصيرة";
      s.author = "أقلامنا";
      s.scenes = [
        scene("البداية", (sc) => {
          sc.prose = "الباب مفتوح.";
          sc.isEnding = true;
        }),
      ];
    });

    const story = compileState(state);
    expect(story.title).toBe("قصة قصيرة");
    expect(story.author).toBe("أقلامنا");
    expect(story.start).toBe("البداية");
    expect(proseOf(story, "البداية")).toBe("الباب مفتوح.");
  });

  it("an empty state produces empty source rather than broken source", () => {
    expect(generateQalam(emptyWriterState())).toBe("");
  });
});

// ---- 2. Choices ------------------------------------------------------------

describe("generateQalam — choices", () => {
  it("carries label, stickiness, prose and destination through the compiler", () => {
    const state = build((s) => {
      s.scenes = [
        scene("البداية", (sc) => {
          sc.prose = "أمامك باب.";
          sc.choices = [
            { ...emptyChoice(), label: "اطرق الباب", consumable: true },
            { ...emptyChoice(), label: "ابتعد", consumable: false },
          ];
        }),
        scene("الداخل", (sc) => { sc.prose = "غرفة مظلمة."; sc.isEnding = true; }),
      ];
      s.scenes[0]!.choices[0]!.destination = s.scenes[1]!.id;
      s.scenes[0]!.choices[0]!.proseAfter = "انفتح الباب ببطء.";
      s.scenes[0]!.choices[1]!.destination = END_DESTINATION;
    });

    const story = compileState(state);
    const items = choicesOf(story, "البداية");

    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe("choice_1");
    expect(items[0]!.label).toBe("اطرق الباب");
    expect(items[0]!.sticky).toBe(false); // consumable → `*`
    expect(items[0]!.divert).toBe("الداخل");
    expect(items[1]!.sticky).toBe(true); // not consumable → `+`
    expect(items[1]!.divert).toBe("END");
  });
});

// ---- 3. Tags ---------------------------------------------------------------

describe("generateQalam — tags", () => {
  it("declares a tag, raises it on a choice, and gates on present and absent", () => {
    const state = build((s) => {
      s.tags = ["شجاع"];
      s.scenes = [
        scene("البداية", (sc) => {
          sc.choices = [
            { ...emptyChoice(), label: "ابقَ", setTag: "شجاع" },
            { ...emptyChoice(), label: "اهرب" },
          ];
        }),
        scene("الغرفة", (sc) => {
          sc.conditionalTexts = [
            { id: "t1", text: "أنت شجاع بما يكفي لتبقى.", condition: { kind: "tag", tag: "شجاع", present: true } },
            { id: "t2", text: "ندمت أنّك دخلت.", condition: { kind: "tag", tag: "شجاع", present: false } },
          ];
          sc.isEnding = true;
        }),
      ];
      for (const c of s.scenes[0]!.choices) c.destination = s.scenes[1]!.id;
    });

    const story = compileState(state);
    expect(story.variables["شجاع"]).toEqual({ type: "boolean", initial: false });

    expect(choicesOf(story, "البداية")[0]!.content).toContainEqual({
      type: "set", var: "شجاع", op: "=", value: true,
    });

    const conds = conditionalsOf(story, "الغرفة");
    expect(conds).toHaveLength(2);
    expect(conds[0]!.condition).toEqual({ var: "شجاع" });
    // PHASE1_SPEC: `لا` must survive as a `not`, not collapse to the bare var.
    expect(conds[1]!.condition).toEqual({ not: { var: "شجاع" } });
  });

  it("gates a choice on a tag being absent", () => {
    const state = build((s) => {
      s.tags = ["عرف_السر"];
      s.scenes = [
        scene("البداية", (sc) => {
          sc.choices = [
            { ...emptyChoice(), label: "قدّم الزجاجة", requires: { kind: "tag", tag: "عرف_السر", present: false }, destination: END_DESTINATION },
          ];
        }),
      ];
    });

    const story = compileState(state);
    expect(choicesOf(story, "البداية")[0]!.condition).toEqual({ not: { var: "عرف_السر" } });
  });
});

// ---- 4. Counters -----------------------------------------------------------

describe("generateQalam — counters", () => {
  it("declares, increments and compares a counter", () => {
    const state = build((s) => {
      s.counters = [{ name: "المكونات", initial: 0 }];
      s.scenes = [
        scene("المهمة", (sc) => {
          sc.conditionalTexts = [
            { id: "t1", text: "الورقة تنتظر بقيّتها.", condition: { kind: "counter", counter: "المكونات", op: "<", value: 3 } },
          ];
          sc.choices = [
            { ...emptyChoice(), label: "إلى السوق", addToCounter: { counter: "المكونات", amount: 1 } },
            { ...emptyChoice(), label: "اخلط العطر", requires: { kind: "counter", counter: "المكونات", op: ">=", value: 3 }, destination: END_DESTINATION },
          ];
        }),
      ];
      s.scenes[0]!.choices[0]!.destination = s.scenes[0]!.id;
    });

    const story = compileState(state);
    expect(story.variables["المكونات"]).toEqual({ type: "number", initial: 0 });

    const items = choicesOf(story, "المهمة");
    expect(items[0]!.content).toContainEqual({ type: "set", var: "المكونات", op: "+=", value: 1 });
    expect(items[1]!.condition).toEqual({ var: "المكونات", op: ">=", value: 3 });

    expect(conditionalsOf(story, "المهمة")[0]!.condition).toEqual({
      var: "المكونات", op: "<", value: 3,
    });
  });
});

// ---- 5. Prose that looks like code -----------------------------------------

describe("sanitizeProse — ordinary Arabic that the tokenizer would read as syntax", () => {
  const hazards: Array<[string, string]> = [
    ["a line opening with the image keyword", "صورة الجدّة معلّقة على الحائط."],
    ["a line opening with the variable keyword", "متغيّر الطقس لا يعني شيئًا هنا."],
    ["a line opening with a star", "* هذا سطر يبدأ بنجمة."],
    ["a line opening with a plus", "+ زائد في أول السطر."],
    ["a line opening with a tilde", "~ موجة في أول السطر."],
    ["a line opening with an equals sign", "= يساوي في أول السطر."],
    ["a line opening with a slash comment", "// ليس تعليقًا، بل نصّ."],
    ["a line opening with the title keyword", "عنوان الكتاب كان ممحوًّا."],
  ];

  for (const [what, prose] of hazards) {
    it(`keeps ${what} as prose`, () => {
      const state = build((s) => {
        s.scenes = [scene("البداية", (sc) => { sc.prose = prose; sc.isEnding = true; })];
      });

      const story = compileState(state);
      const text = proseOf(story, "البداية");
      // U+2060 is invisible; the author's characters are all still there.
      expect(text.replace(/⁠/g, "")).toBe(prose);
      expect(story.passages["البداية"]!.content.filter((n) => n.type === "text")).toHaveLength(1);
    });
  }

  it("substitutes braces and arrows, which have no invisible escape", () => {
    const state = build((s) => {
      s.scenes = [scene("البداية", (sc) => { sc.prose = "قال {شيئًا} ثم مضى -> بعيدًا."; sc.isEnding = true; })];
    });
    const story = compileState(state);
    expect(proseOf(story, "البداية")).toBe("قال (شيئًا) ثم مضى → بعيدًا.");
  });

  it("leaves prose with nothing dangerous byte-for-byte alone", () => {
    const plain = "رفوف الخشب تصطفّ حتى السقف.\nوفي كلّ جرّة رائحةٌ تنتظر.";
    expect(sanitizeProse(plain)).toBe(plain);
  });
});

// ---- 6. Paragraphs ---------------------------------------------------------

describe("generateQalam — paragraphs", () => {
  it("preserves PHASE1_SPEC §1.16: single newline breaks a line, blank line opens a paragraph", () => {
    const state = build((s) => {
      s.scenes = [scene("البداية", (sc) => {
        sc.prose = "السطر الأول.\nالسطر الثاني.\n\nفقرة ثانية.";
        sc.isEnding = true;
      })];
    });

    const story = compileState(state);
    const texts = story.passages["البداية"]!.content.filter((n) => n.type === "text");
    expect(texts.map((n) => (n as { value: string | null }).value)).toEqual([
      "السطر الأول.",
      null, // the line-break sentinel
      "السطر الثاني.",
      "فقرة ثانية.",
    ]);
  });
});

// ---- 7. Names --------------------------------------------------------------

describe("toIdentifier / buildNameMap", () => {
  it("turns a spaced title into one identifier", () => {
    expect(toIdentifier("دكّان العطّار", "س")).toBe("دكان_العطار");
  });

  it("refuses to hand a scene a reserved word as its name", () => {
    expect(toIdentifier("نهاية", "س")).toBe("نهاية_");
  });

  it("does not let a leading digit start an identifier", () => {
    expect(toIdentifier("3 أبواب", "س")).toBe("_3_أبواب");
  });

  it("keeps two scenes distinct when their titles normalise the same", () => {
    const state = build((s) => {
      s.scenes = [scene("الجرّة"), scene("الجرة")];
    });
    const names = buildNameMap(state);
    const ids = [...names.scene.values()];
    expect(ids[0]).toBe("الجرة");
    expect(ids[1]).toBe("الجرة_2");
    expect(new Set(ids).size).toBe(2);
  });

  it("a story whose scene is called نهاية still compiles", () => {
    const state = build((s) => {
      s.scenes = [
        scene("البداية"),
        scene("نهاية", (sc) => { sc.prose = "انتهى."; sc.isEnding = true; }),
      ];
      s.scenes[0]!.autoDivert = s.scenes[1]!.id;
    });
    const story = compileState(state);
    expect(Object.keys(story.passages)).toEqual(["البداية", "نهاية_"]);
  });
});

// ---- 8. The العطر المفقود structure ----------------------------------------

/**
 * The sample story rebuilt out of nothing but visual-writer parts: eleven
 * scenes, a counter, two tags, gated choices, conditional text and two endings.
 * This is VISUAL_WRITER_SPEC.md's second required test — proof the generator
 * covers every feature the shipped example needs.
 */
function perfumeState(): WriterState {
  resetIds();
  const state = emptyWriterState();
  state.title = "العطر المفقود";
  state.author = "أقلامنا";
  state.tags = ["عرف_السر", "حاول_الخلط"];
  state.counters = [{ name: "المكونات", initial: 0 }, { name: "الثقة", initial: 0 }];

  const dukkan = scene("الدكان");
  const jirar = scene("الجرار");
  const muhimma = scene("المهمة");
  const suq = scene("السوق");
  const bayt = scene("البيت");
  const makhzan = scene("المخزن");
  const khalt = scene("الخلط");
  const badFail = scene("بعد الفشل");
  const naqisa = scene("الخاتمة الناقصة");
  const ulya = scene("الجرة العليا");
  const kamila = scene("الخاتمة الكاملة");

  dukkan.prose = "رفوف الخشب تصطفّ حتى السقف، وفي كلّ جرّة رائحةٌ تنتظر.";
  dukkan.choices = [
    { ...emptyChoice(), label: "اسأليه عن الثلاثة", consumable: true, destination: jirar.id },
    {
      ...emptyChoice(),
      label: "تأمّلي الدكّان أولًا",
      consumable: true,
      proseAfter: "في الزاوية العليا جرّةٌ وحدها، لا ورقة عليها ولا اسم.",
      addToCounter: { counter: "الثقة", amount: 1 },
      destination: jirar.id,
    },
  ];

  jirar.prose = "فتح ثلاث جرارٍ ووضعها في الضوء.";
  jirar.autoDivert = muhimma.id;

  muhimma.conditionalTexts = [
    { id: "p1", text: "الورقة الصفراء أمامكِ فارغة. لا شيء بعد.", condition: { kind: "counter", counter: "المكونات", op: "==", value: 0 } },
    { id: "p2", text: "الورقة تنتظر بقيّتها.", condition: { kind: "counter", counter: "المكونات", op: "<", value: 3 } },
  ];
  muhimma.choices = [
    { ...emptyChoice(), label: "إلى سوق البخاريّة", consumable: true, destination: suq.id },
    { ...emptyChoice(), label: "إلى بيت جدّتكِ", consumable: true, destination: bayt.id },
    { ...emptyChoice(), label: "إلى المخزن", consumable: true, destination: makhzan.id },
    { ...emptyChoice(), label: "اخلطي العطر", requires: { kind: "counter", counter: "المكونات", op: ">=", value: 3 }, destination: khalt.id },
    { ...emptyChoice(), label: "اسألي المعلّم عن الجرّة العليا", requires: { kind: "tag", tag: "حاول_الخلط", present: true }, destination: ulya.id },
  ];

  suq.prose = "الشمس عمودية والدرج ضيّق.";
  suq.choices = [{ ...emptyChoice(), label: "اقطفي الزهر", consumable: true, addToCounter: { counter: "المكونات", amount: 1 }, destination: muhimma.id }];

  bayt.prose = "باب البيت القديم يصرّ.";
  bayt.choices = [
    { ...emptyChoice(), label: "افتحيها", consumable: true, proseAfter: "ملأت الرائحة المطبخ دفعةً واحدة.", addToCounter: { counter: "المكونات", amount: 1 }, destination: muhimma.id },
    { ...emptyChoice(), label: "خُذيها مغلقة", consumable: true, addToCounter: { counter: "المكونات", amount: 1 }, destination: muhimma.id },
  ];

  makhzan.prose = "المخزن بارد ولا نافذة فيه.";
  makhzan.choices = [{ ...emptyChoice(), label: "عودي واطلبي المفتاح", consumable: true, addToCounter: { counter: "المكونات", amount: 1 }, destination: muhimma.id }];

  khalt.prose = "قطرتان من ماء الورد.";
  khalt.conditionalTexts = [{ id: "p3", text: "وفوقها صندل الرفّ، قليلًا.", condition: { kind: "tag", tag: "عرف_السر", present: true } }];
  khalt.choices = [
    { ...emptyChoice(), label: "قدّمي الزجاجة للمعلّم", requires: { kind: "tag", tag: "عرف_السر", present: true }, proseAfter: "رفعها إلى النور وشمّها. \"هذه هي.\"", destination: kamila.id },
    { ...emptyChoice(), label: "قدّمي الزجاجة للمعلّم", requires: { kind: "tag", tag: "عرف_السر", present: false }, proseAfter: "\"قريب،\" قال. \"لكنّه ليس عطر جدّتي.\"", setTag: "حاول_الخلط", destination: badFail.id },
  ];

  badFail.prose = "الورقة الصفراء ما زالت فارغة.";
  badFail.choices = [
    { ...emptyChoice(), label: "ابحثي عن الناقص", consumable: true, destination: muhimma.id },
    { ...emptyChoice(), label: "اكتفي بهذا", consumable: true, destination: naqisa.id },
  ];

  naqisa.prose = "خرجتِ ورائحة الدكّان في كمّكِ، وفي الورقة لا شيء.";
  naqisa.isEnding = true;

  ulya.prose = "سألتِه عن الجرّة التي لا اسم عليها.";
  ulya.choices = [{
    ...emptyChoice(),
    label: "افتحيها معه",
    consumable: true,
    proseAfter: "الرائحة رائحة الدكّان في الصباح.",
    setTag: "عرف_السر",
    addToCounter: { counter: "المكونات", amount: 1 },
    destination: muhimma.id,
  }];

  kamila.prose = "كتب المعلّم أسماء المكوّنات الأربعة على الورقة الصفراء.";
  kamila.isEnding = true;

  state.scenes = [dukkan, jirar, muhimma, suq, bayt, makhzan, khalt, badFail, naqisa, ulya, kamila];
  return state;
}

describe("العطر المفقود, rebuilt from visual-writer parts", () => {
  it("compiles with no errors", () => {
    expect(() => compileState(perfumeState())).not.toThrow();
  });

  it("produces the eleven scenes, two tags, two counters and two endings", () => {
    const story = compileState(perfumeState());
    expect(Object.keys(story.passages)).toHaveLength(11);
    expect(story.start).toBe("الدكان");
    expect(Object.keys(story.variables).sort()).toEqual(
      ["المكونات", "الثقة", "حاول_الخلط", "عرف_السر"].sort(),
    );
    const endings = Object.values(story.passages).filter((p) =>
      p.content.some((n) => n.type === "divert" && (n as { target: string }).target === "END"),
    );
    expect(endings).toHaveLength(2);
  });

  it("wires every choice to the passage the author picked", () => {
    const story = compileState(perfumeState());
    // Not one choice anywhere in the story is left without a destination —
    // a missing `->` compiles fine and dead-ends the reader in silence.
    const diverts = Object.entries(story.passages).flatMap(([name, p]) =>
      p.content
        .filter((n): n is Extract<Node, { type: "choices" }> => n.type === "choices")
        .flatMap((n) => n.items.map((it) => ({ from: name, label: it.label, to: it.divert }))),
    );
    expect(diverts.filter((d) => d.to === null)).toEqual([]);
    expect(diverts).toHaveLength(16);
    const targets = new Set(diverts.map((d) => d.to));
    for (const t of targets) {
      expect(t === "END" || t! in story.passages, `unknown target ${t}`).toBe(true);
    }
    expect(diverts.find((d) => d.label === "اخلطي العطر")?.to).toBe("الخلط");
  });

  it("has no validation problems — every choice has a destination and every scene is reachable", () => {
    expect(validateWriterState(perfumeState())).toEqual([]);
  });
});

// ---- 9. The round trip -----------------------------------------------------

describe("round trip — generate → compile → import → generate", () => {
  it("is byte-identical for the whole العطر المفقود structure", () => {
    const first = generateQalam(perfumeState());
    const story = compile(first, "writer.qalam", { timestamp: "2026-08-01T00:00:00.000Z" }) as unknown as StoryJSON;

    const imported = importWriterState(story);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(generateQalam(imported.state)).toBe(first);
  });

  it("keeps prose, tags, counters and gates intact through the trip", () => {
    const story = compileState(perfumeState());
    const imported = importWriterState(story);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const s = imported.state;
    expect(s.title).toBe("العطر المفقود");
    expect(s.scenes).toHaveLength(11);
    expect(s.tags.sort()).toEqual(["حاول_الخلط", "عرف_السر"].sort());
    expect(s.counters.map((c) => c.name).sort()).toEqual(["المكونات", "الثقة"].sort());
    expect(s.scenes[0]!.prose).toBe("رفوف الخشب تصطفّ حتى السقف، وفي كلّ جرّة رائحةٌ تنتظر.");
    expect(s.scenes[2]!.choices[3]!.requires).toEqual({ kind: "counter", counter: "المكونات", op: ">=", value: 3 });
    expect(s.scenes[6]!.choices[1]!.requires).toEqual({ kind: "tag", tag: "عرف_السر", present: false });
    expect(s.scenes[6]!.choices[1]!.setTag).toBe("حاول_الخلط");
    expect(s.scenes[8]!.isEnding).toBe(true);
  });

  it("survives a multi-paragraph scene", () => {
    const state = build((s) => {
      s.scenes = [scene("البداية", (sc) => {
        sc.prose = "سطر أول.\nسطر ثانٍ.\n\nفقرة أخرى.";
        sc.isEnding = true;
      })];
    });
    const imported = importWriterState(compileState(state));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.state.scenes[0]!.prose).toBe("سطر أول.\nسطر ثانٍ.\n\nفقرة أخرى.");
  });
});

// ---- 9b. The example the editor actually offers ----------------------------

/**
 * `افتح مثالًا` must open in the visual writer. Nothing checked this, and the
 * editor shipped for a day with an example that ejected the author into a
 * "this story is too advanced" banner whose only button led further away.
 *
 * This is the gate on `scripts/copy-seed.mjs`: change the seed to a story that
 * uses a multi-branch conditional or an interpolation and this fails, naming
 * the passage.
 */
describe("the seed story — افتح مثالًا", () => {
  const seed = () => compile(SEED_STORY, "seed.qalam") as unknown as StoryJSON;

  it("compiles", () => {
    expect(() => seed()).not.toThrow();
  });

  it("opens in the visual writer", () => {
    const result = importWriterState(seed());
    if (!result.ok) throw new Error(`the shipped example does not open: ${result.reason}`);
    expect(result.state.scenes.length).toBeGreaterThan(1);
  });

  it("shows a beginner every field the pane has", () => {
    const result = importWriterState(seed());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.state;

    expect(s.tags.length, "no tag to demonstrate أثر").toBeGreaterThan(0);
    expect(s.counters.length, "no counter to demonstrate عدّاد").toBeGreaterThan(0);

    const choices = s.scenes.flatMap((sc) => sc.choices);
    expect(choices.some((c) => c.setTag), "no choice raises a tag").toBe(true);
    expect(choices.some((c) => c.addToCounter), "no choice moves a counter").toBe(true);
    expect(choices.some((c) => c.requires), "no gated choice").toBe(true);
    expect(choices.some((c) => c.consumable), "no one-time choice").toBe(true);
    expect(choices.some((c) => c.proseAfter.trim().length > 0), "no after-prose").toBe(true);
    expect(
      s.scenes.some((sc) => sc.conditionalTexts.length > 0),
      "no conditional text",
    ).toBe(true);
    expect(s.scenes.filter((sc) => sc.isEnding).length, "fewer than two endings")
      .toBeGreaterThanOrEqual(2);
    expect(s.imageStyle.trim().length, "no أسلوب_الصور to demonstrate").toBeGreaterThan(0);
    expect(s.characters.trim().length, "no أوصاف_الشخصيات to demonstrate").toBeGreaterThan(0);
  });

  /**
   * The example has two images and the same boy is in both. If his description
   * does not reach both of them he is a different child in each — which is the
   * failure the field exists to stop, so the example must actually show it
   * working rather than merely carry the line.
   */
  it("its character description reaches every image it declares", () => {
    const result = importWriterState(seed());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.images.length).toBeGreaterThan(1);
    for (const img of result.state.images) {
      expect(
        relevantCharacterLines(result.state.characters, img.description),
        `no character matches the description of "${img.name}"`,
      ).not.toEqual([]);
    }
  });

  it("has no problems of its own", () => {
    const result = importWriterState(seed());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateWriterState(result.state)).toEqual([]);
  });

  it("survives the round trip", () => {
    const imported = importWriterState(seed());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const regenerated = generateQalam(imported.state);
    const again = importWriterState(compile(regenerated, "seed.qalam") as unknown as StoryJSON);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(generateQalam(again.state)).toBe(regenerated);
  });
});

// ---- 10. What the importer must refuse -------------------------------------

describe("importWriterState — advanced stories fall back rather than lose work", () => {
  const refusals: Array<[string, string]> = [
    ["interpolation", `متغير س = 1\n\n=== البداية ===\nجمعت {س} قطرة.\n-> نهاية\n`],
    ["sub-sections", `=== البداية ===\nنصّ.\n= فرع\nنصّ آخر.\n-> نهاية\n`],
    ["a string variable", `متغير الاسم = "سلمى"\n\n=== البداية ===\nنصّ.\n-> نهاية\n`],
    ["a multi-branch conditional", `متغير ع = 0\n\n=== البداية ===\n{ع:\n  - ع < 3: قليل.\n  - غير_ذلك: كثير.\n}\n-> نهاية\n`],
    ["nested choices", `=== البداية ===\n* [أ]\n** [ب]\n   -> نهاية\n`],
  ];

  for (const [what, source] of refusals) {
    it(`refuses ${what}`, () => {
      const story = compile(source, "t.qalam") as unknown as StoryJSON;
      const result = importWriterState(story);
      expect(result.ok).toBe(false);
    });
  }

  it("accepts a plain story it could have written itself", () => {
    const source = `عنوان: "باب"\n\nمتغير شجاع = خطأ\n\n=== البداية ===\n\nأمامك باب.\n\n* [ادخل]\n  ~ شجاع = صح\n  -> الداخل\n\n=== الداخل ===\n\nغرفة.\n\n-> نهاية\n`;
    const story = compile(source, "t.qalam") as unknown as StoryJSON;
    const result = importWriterState(story);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.scenes.map((s) => s.title)).toEqual(["البداية", "الداخل"]);
    expect(result.state.tags).toEqual(["شجاع"]);
    expect(result.state.scenes[0]!.choices[0]!.setTag).toBe("شجاع");
  });
});

// ---- 11. The writer's own errors -------------------------------------------

describe("validateWriterState", () => {
  it("names a choice with no destination", () => {
    const state = build((s) => {
      s.scenes = [scene("البداية", (sc) => {
        sc.choices = [{ ...emptyChoice(), label: "اذهب" }];
      })];
    });
    const issues = validateWriterState(state);
    expect(issues.some((i) => i.choiceId && i.message.includes("وجهة"))).toBe(true);
  });

  it("names a scene nothing reaches", () => {
    const state = build((s) => {
      s.scenes = [
        scene("البداية", (sc) => { sc.isEnding = true; }),
        scene("المهجور", (sc) => { sc.isEnding = true; }),
      ];
    });
    const issues = validateWriterState(state);
    expect(issues.some((i) => i.sceneId === state.scenes[1]!.id && i.message.includes("لا يصل"))).toBe(true);
  });

  it("still generates compilable source while the story is half-written", () => {
    const state = build((s) => {
      s.scenes = [scene("البداية", (sc) => {
        sc.choices = [{ ...emptyChoice(), label: "" }];
      })];
    });
    expect(validateWriterState(state).length).toBeGreaterThan(0);
    expect(() => compileState(state)).not.toThrow();
  });
});

// ---- 11b. Images ----------------------------------------------------------

describe("images", () => {
  function withImage(): WriterState {
    return build((s) => {
      s.title = "قصة مصوّرة";
      s.imageStyle = "رسم كتب أطفال، ألوان ترابية";
      s.images = [{ name: "بوابة المدينة", description: "بوابة حجرية عند الغروب" }];
      s.scenes = [
        scene("البداية", (sc) => {
          sc.image = "بوابة المدينة";
          sc.prose = "وقفت أمام البوابة.";
          sc.isEnding = true;
        }),
      ];
    });
  }

  it("declares the image, sets the style, and places it in the scene", () => {
    const story = compileState(withImage());

    const images = (story as unknown as { images?: Record<string, { alt: string }> }).images!;
    expect(images["بوابة_المدينة"]).toEqual({ alt: "بوابة حجرية عند الغروب" });
    expect((story as unknown as { imageStyle?: string }).imageStyle)
      .toBe("رسم كتب أطفال، ألوان ترابية");

    // Placed FIRST, because that is where the card shows it and where the
    // runtime will render it. Anywhere else would be a different story.
    const content = contentOf(story, "البداية");
    expect(content[0]).toEqual({ type: "image", name: "بوابة_المدينة" });
  });

  it("round-trips byte-identically", () => {
    const first = generateQalam(withImage());
    const story = compile(first, "w.qalam", { timestamp: "2026-08-01T00:00:00.000Z" }) as unknown as StoryJSON;
    const imported = importWriterState(story);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.state.imageStyle).toBe("رسم كتب أطفال، ألوان ترابية");
    expect(imported.state.images).toEqual([
      { name: "بوابة_المدينة", description: "بوابة حجرية عند الغروب" },
    ]);
    expect(imported.state.scenes[0]!.image).toBe("بوابة_المدينة");
    expect(generateQalam(imported.state)).toBe(first);
  });

  it("keeps a declared-but-unplaced image — that is not an error", () => {
    const state = build((s) => {
      s.images = [{ name: "خريطة", description: "خريطة صفراء" }];
      s.scenes = [scene("البداية", (sc) => { sc.prose = "نصّ."; sc.isEnding = true; })];
    });
    const story = compileState(state);
    const images = (story as unknown as { images?: Record<string, unknown> }).images!;
    expect(Object.keys(images)).toEqual(["خريطة"]);
    const imported = importWriterState(story);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.state.images).toHaveLength(1);
    expect(imported.state.scenes[0]!.image).toBeNull();
  });

  /**
   * ⚠️ This documents a bug in `@aqlamna/core`, not a decision here.
   *
   * `صورة: الاسم` is SILENTLY DROPPED by the parser unless it is the first node
   * in its passage. `parseTextOrConditional()` collects a logical line and
   * breaks on PASSAGE_MARKER, CHOICE_STAR, CHOICE_PLUS, DIVERT, DIVERT_RETURN,
   * THREAD, ASSIGN and SUBSECTION_MARKER — but not KEYWORD_IMAGE. Once prose has
   * started, the image keyword is swallowed into the text buffer and discarded
   * as an unexpected token. No error, no warning, no picture.
   *
   * So `IMAGES_SPEC.md`'s "ترتيبها بين النصّ والخيارات هو ترتيب كتابتها" is not
   * true today: position 1 is the only one that survives. The visual writer
   * places images first, which is why it works — and this test pins the real
   * behaviour so that fixing core fails here loudly rather than silently
   * changing what the importer must accept.
   */
  it("core drops an image that is not the passage's first node — known bug", () => {
    const source = [
      'صورة خريطة = "خريطة صفراء"',
      "",
      "=== البداية ===",
      "",
      "نصّ قبل الصورة.",
      "",
      "صورة: خريطة",
      "",
      "-> نهاية",
      "",
    ].join("\n");
    const story = compile(source, "t.qalam") as unknown as StoryJSON;

    // The declaration survives; the placement does not.
    expect(Object.keys((story as unknown as { images: Record<string, unknown> }).images))
      .toEqual(["خريطة"]);
    expect(contentOf(story, "البداية").map((n) => n.type)).toEqual(["text", "divert"]);

    // Placed first, the very same image is kept.
    const ok = compile(
      ['صورة خريطة = "خريطة صفراء"', "", "=== البداية ===", "", "صورة: خريطة", "", "نصّ.", "", "-> نهاية", ""].join("\n"),
      "t.qalam",
    ) as unknown as StoryJSON;
    expect(contentOf(ok, "البداية").map((n) => n.type)).toEqual(["image", "text", "divert"]);
  });

  it("a story with no images declares none at all", () => {
    const story = compileState(perfumeState());
    expect((story as unknown as { images?: unknown }).images).toBeUndefined();
  });
});

// ---- 12. AI suggestions landing in the cards -------------------------------

describe("applyAIFragment — where an accepted suggestion goes", () => {
  function twoScenes(): WriterState {
    return build((s) => {
      s.scenes = [
        scene("البداية", (sc) => { sc.prose = "أمامك باب."; }),
        scene("الداخل", (sc) => { sc.prose = "غرفة."; sc.isEnding = true; }),
      ];
      s.scenes[0]!.autoDivert = s.scenes[1]!.id;
    });
  }

  it("أكمل المقطع appends prose to the scene the author last touched", () => {
    const state = twoScenes();
    const result = applyAIFragment(state, "continue_scene", "الريح تهزّ الأغصان خلفك.", state.scenes[0]!.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.scenes[0]!.prose).toBe("أمامك باب.\n\nالريح تهزّ الأغصان خلفك.");
    expect(result.state.scenes[1]!.prose).toBe("غرفة.");
  });

  it("اقترح خيارات adds choice cards wired to the passages the AI named", () => {
    const state = twoScenes();
    const fragment = "* [اطرق الباب]\n  -> الداخل\n\n+ [ابتعد]\n  -> نهاية\n";
    const result = applyAIFragment(state, "suggest_choices", fragment, state.scenes[0]!.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const choices = result.state.scenes[0]!.choices;
    expect(choices.map((c) => c.label)).toEqual(["اطرق الباب", "ابتعد"]);
    expect(choices[0]!.destination).toBe(state.scenes[1]!.id);
    expect(choices[0]!.consumable).toBe(true);
    expect(choices[1]!.destination).toBe(END_DESTINATION);
    expect(choices[1]!.consumable).toBe(false);
    // And the result still compiles — the round trip is the only real proof.
    expect(() => compileState(result.state)).not.toThrow();
  });

  it("اكتب هذا المقطع adds a whole new scene", () => {
    const state = twoScenes();
    const result = applyAIFragment(state, "write_passage", "رائحة بخور قديم.\n\n* [اخرج]\n  -> نهاية\n", null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.scenes).toHaveLength(3);
    expect(result.state.scenes[2]!.prose).toBe("رائحة بخور قديم.");
    expect(result.state.scenes[2]!.choices[0]!.label).toBe("اخرج");
    expect(result.state.scenes[2]!.title).not.toBe("");
  });

  it("refuses a suggestion the form cannot draw rather than dropping half of it", () => {
    const state = twoScenes();
    // Nested choices have no card to live in.
    const result = applyAIFragment(state, "suggest_choices", "* [أ]\n** [ب]\n   -> نهاية\n", state.scenes[0]!.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/[؀-ۿ]/);
  });

  it("refuses a suggestion that does not compile against the real story", () => {
    const state = twoScenes();
    const result = applyAIFragment(state, "suggest_choices", "* [اذهب]\n  -> مقطع_لا_وجود_له\n", state.scenes[0]!.id);
    expect(result.ok).toBe(false);
  });

  it("asks about the scene the answer will land in, not the last one", () => {
    const state = perfumeState();
    const middle = state.scenes[3]!; // السوق — neither first nor last

    const context = sceneContextText(state, middle.id);
    expect(context).toContain("الشمس عمودية والدرج ضيّق.");
    expect(context).toContain("اقطفي الزهر");
    // The last scene's prose must NOT be in it — that was the old behaviour,
    // and it is invisible when wrong: the AI answers about the wrong scene and
    // the text it returns is perfectly good Arabic.
    expect(context).not.toContain("كتب المعلّم أسماء المكوّنات");
    expect(context).not.toContain("رفوف الخشب"); // nor the first scene's
  });

  it("returns nothing for a scene that is not there, so the caller can fall back", () => {
    const state = perfumeState();
    expect(sceneContextText(state, null)).toBe("");
    expect(sceneContextText(state, "s-does-not-exist")).toBe("");
  });

  it("leaves the original state untouched on every path", () => {
    const state = twoScenes();
    const before = JSON.stringify(state);
    applyAIFragment(state, "continue_scene", "نصّ.", state.scenes[0]!.id);
    applyAIFragment(state, "suggest_choices", "* [أ]\n** [ب]\n   -> نهاية\n", state.scenes[0]!.id);
    expect(JSON.stringify(state)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Bugs reported from the live editor, 2 Aug 2026
// ---------------------------------------------------------------------------

describe("an AI suggestion always lands somewhere, and says where first", () => {
  function twoScenes(): WriterState {
    return build((s) => {
      s.scenes = [
        scene("البداية", (sc) => { sc.prose = "أمامك باب."; }),
        scene("الداخل", (sc) => { sc.prose = "غرفة."; sc.isEnding = true; }),
      ];
      s.scenes[0]!.autoDivert = s.scenes[1]!.id;
    });
  }

  it("a stale focus id falls back to the last scene instead of vanishing", () => {
    const state = twoScenes();
    // Scene ids are regenerated on every re-import — a reload, switching to
    // متقدّم and back, opening the example. The remembered focus then names a
    // scene that no longer exists.
    const result = applyAIFragment(state, "suggest_choices", "* [اذهب]\n  -> نهاية\n", "s-from-a-previous-life");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const last = result.state.scenes[result.state.scenes.length - 1]!;
    expect(result.sceneId).toBe(last.id);
    expect(last.choices.length).toBeGreaterThan(state.scenes[state.scenes.length - 1]!.choices.length);

    // The whole story must not come back unchanged — that is what used to
    // happen, reported as ok, with the suggestion nowhere on screen.
    expect(JSON.stringify(result.state.scenes)).not.toBe(JSON.stringify(state.scenes));
  });

  it("names the scene it will change, and it is the focused one", () => {
    const state = perfumeState();
    const middle = state.scenes[3]!;
    expect(aiTargetScene(state, middle.id)?.id).toBe(middle.id);
    expect(aiTargetScene(state, "s-does-not-exist")?.id).toBe(state.scenes[state.scenes.length - 1]!.id);
    expect(aiTargetScene(state, null)?.id).toBe(state.scenes[state.scenes.length - 1]!.id);
    expect(aiTargetScene(emptyWriterState(), null)).toBeNull();
  });

  it("reports which scene it changed, so the pane can scroll to it", () => {
    const state = twoScenes();
    const first = state.scenes[0]!;

    const cont = applyAIFragment(state, "continue_scene", "سطر آخر.", first.id);
    expect(cont.ok && cont.sceneId).toBe(first.id);

    const made = applyAIFragment(state, "write_passage", "مقطع جديد.\n", first.id);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    // A new scene, not the focused one: أضف appended it at the bottom.
    expect(made.sceneId).toBe(made.state.scenes[made.state.scenes.length - 1]!.id);
    expect(made.sceneId).not.toBe(first.id);
  });
});

describe("an image's bytes are keyed by the name the story compiles to", () => {
  it("a display name with a space becomes an identifier, and one map answers for both", () => {
    const ids = imageIdentifiers([{ name: "بوابة المدينة" }, { name: "الوادي" }]);
    expect(ids.get("بوابة المدينة")).toBe("بوابة_المدينة");
    expect(ids.get("الوادي")).toBe("الوادي");
  });

  it("the identifier is exactly the key the compiled story uses", () => {
    // The card stores the drawn bytes under this key; the player and the
    // exporter look them up by the compiled JSON's key. They were different
    // for any name that is not already an identifier, so the picture appeared
    // on the card and in neither the player nor the exported file.
    const state = emptyWriterState();
    const scene = emptyScene("البداية");
    scene.prose = "وقفت أمام البوابة.";
    scene.image = "بوابة المدينة";
    state.scenes = [scene];
    state.images = [{ name: "بوابة المدينة", description: "بوابة حجرية عند الغروب" }];

    const story = compileState(state);
    const keys = Object.keys(story.images ?? {});
    expect(keys).toEqual(["بوابة_المدينة"]);
    expect(imageIdentifiers(state.images).get("بوابة المدينة")).toBe(keys[0]);

    // And the scene really points at it, so the player has something to draw.
    const nodes = story.passages["البداية"]!.content;
    expect(nodes[0]).toEqual({ type: "image", name: "بوابة_المدينة" });
  });

  it("two images that sanitise to the same identifier stay distinct", () => {
    const ids = imageIdentifiers([{ name: "باب المدينة" }, { name: "باب_المدينة" }]);
    expect(new Set(ids.values()).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// What the model actually returns — captured from DeepSeek (deepseek-v4-flash)
// on 2 Aug 2026 with this project's own prompts. Every fragment below is a real
// response, pasted verbatim.
// ---------------------------------------------------------------------------

describe("an AI scene arrives with its choices in the choice fields", () => {
  function twoScenes(): WriterState {
    return build((s) => {
      s.scenes = [
        scene("البداية", (sc) => { sc.prose = "تستيقظ في غرفة مظلمة."; }),
        scene("الممر", (sc) => { sc.prose = "الممر طويل وجدرانه رطبة."; }),
      ];
      s.scenes[0]!.autoDivert = s.scenes[1]!.id;
    });
  }

  // The report, in the author's words: "when you click apply and it adds a new
  // scene the choices appear in story field. I want them to be placed in the
  // choices." This is the response that did it.
  const NUMBERED = `الممر طويل وجدرانه رطبة. أضع يدي على الجدار البارد، فأشعر بحصى صغيرة تحت أطراف أصابعي.

ما الذي أفعل؟

1. أمشي نحو الضوء الخافت.
2. أتوقّف وأنادي: "من هناك؟"
3. أعود أدراجي قبل أن أصل إلى نهايته.`;

  const DASHED = `وصل إلى نهاية الممر حيث بابٌ خشبيّ نصفُه مفتوح.

- ادفع الباب ببطء
- عُد أدراجك نحو الصوت
- اصغِ جيدًا قبل أن تتحرّك`;

  it("اكتب هذا المقطع: a numbered list becomes choice cards, not prose", () => {
    const result = applyAIFragment(twoScenes(), "write_passage", NUMBERED, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const made = result.state.scenes[result.state.scenes.length - 1]!;
    expect(made.choices.map((c) => c.label)).toEqual([
      "أمشي نحو الضوء الخافت",
      'أتوقّف وأنادي: "من هناك؟"',
      "أعود أدراجي قبل أن أصل إلى نهايته",
    ]);

    // …and not a word of them is left in the story box.
    expect(made.prose).toContain("أضع يدي على الجدار البارد");
    expect(made.prose).not.toContain("أمشي نحو الضوء");
    expect(made.prose).not.toMatch(/^\s*[0-9١-٩]\./m);

    // The scene the author gets still compiles.
    expect(() => compileState(result.state)).not.toThrow();
  });

  it("اكتب هذا المقطع: a dashed list too", () => {
    const result = applyAIFragment(twoScenes(), "write_passage", DASHED, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const made = result.state.scenes[result.state.scenes.length - 1]!;
    expect(made.choices).toHaveLength(3);
    expect(made.prose).not.toContain("ادفع الباب");
  });

  // The other half of the same defect: three good choices were REFUSED
  // outright because the model left the brackets off, and the author was told
  // their suggestion "did not fit the story".
  it("اقترح خيارات: a choice with no brackets is repaired, not refused", () => {
    const state = twoScenes();
    const raw = `* أتقدّم بحذر
  -> الممر

* أتوقّف للحظة
  -> البداية`;
    const result = applyAIFragment(state, "suggest_choices", raw, state.scenes[1]!.id);
    expect(result.ok, result.ok ? "" : (result as { reason: string }).reason).toBe(true);
    if (!result.ok) return;

    const target = result.state.scenes[1]!;
    expect(target.choices.map((c) => c.label)).toEqual(["أتقدّم بحذر", "أتوقّف للحظة"]);
    expect(target.prose).toBe("الممر طويل وجدرانه رطبة.");
  });

  it("اقترح خيارات: a properly bracketed answer is untouched", () => {
    const state = twoScenes();
    const raw = `* [ألمس الجدار] أصابعي تبتلّ.
  -> الممر`;
    const result = applyAIFragment(state, "suggest_choices", raw, state.scenes[1]!.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.scenes[1]!.choices[0]!.label).toBe("ألمس الجدار");
    expect(result.state.scenes[1]!.choices[0]!.proseAfter).toContain("أصابعي تبتلّ");
  });

  it("أكمل المقطع: the model re-stating the scene's own line does not duplicate it", () => {
    const state = twoScenes();
    const echo = `الممر طويل وجدرانه رطبة.

تقطر المياهُ من سقفه فتنساب في شقوقٍ عتيقة.`;
    const result = applyAIFragment(state, "continue_scene", echo, state.scenes[1]!.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const prose = result.state.scenes[1]!.prose;
    expect(prose.match(/الممر طويل وجدرانه رطبة/g)).toHaveLength(1);
    expect(prose).toContain("تقطر المياهُ من سقفه");
  });

  it("أكمل المقطع: a continuation that is nothing but an echo changes nothing", () => {
    const state = twoScenes();
    const before = JSON.stringify(state.scenes[1]);
    const result = applyAIFragment(state, "continue_scene", "الممر طويل وجدرانه رطبة.", state.scenes[1]!.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.state.scenes[1])).toBe(before);
  });

  it("a list inside the prose, with the scene continuing after it, is left alone", () => {
    // Only a list at the END becomes choices. A model that writes one mid-scene
    // is writing prose, and turning that into buttons would be an invention.
    const state = twoScenes();
    const midway = `فتح الدفتر فقرأ:

- خبز
- ملح

ثمّ أغلقه وخرج.`;
    const result = applyAIFragment(state, "write_passage", midway, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const made = result.state.scenes[result.state.scenes.length - 1]!;
    expect(made.choices).toHaveLength(0);
    expect(made.prose).toContain("خبز");
  });
});

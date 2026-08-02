// ---------------------------------------------------------------------------
// Compiled story JSON → WriterState.
//
// The round trip. `.qalam` source is what IndexedDB holds, so opening the
// editor means reading source the visual writer did not necessarily produce.
// Rather than write a second parser (VISUAL_WRITER_SPEC.md option B), this maps
// back from the compiled JSON, which `@aqlamna/core` already produced.
//
// The whole point of this file is the `unsupported` path. The language is
// larger than the visual writer: interpolation, nested choices, tunnels,
// threads, sub-sections, lists, images and multi-branch conditionals all
// compile to JSON this model cannot represent. Importing them "as best we can"
// would delete the author's work the moment they touched an unrelated field.
// So anything not representable stops the import and names itself, and the pane
// says so and offers the code editor.
// ---------------------------------------------------------------------------

import type { StoryJSON } from "@aqlamna/runtime";
import {
  END_DESTINATION,
  emptyWriterState,
  nextId,
  type Choice,
  type ConditionalText,
  type CounterOp,
  type Scene,
  type WriterCondition,
  type WriterState,
} from "./writer-model.js";

// The runtime's public entry point exports `StoryJSON` and nothing beneath it.
// Deriving the node types from it, rather than re-exporting them from
// `@aqlamna/runtime`, keeps that package untouched — and keeps these aliases
// correct by construction if its shapes ever change.
type ContentNode = StoryJSON["passages"][string]["content"][number];
type ChoiceItem = Extract<ContentNode, { type: "choices" }>["items"][number];
type Condition = Extract<ContentNode, { type: "conditional" }>["condition"];

export type ImportResult =
  | { ok: true; state: WriterState }
  | { ok: false; reason: string };

const COUNTER_OPS = new Set<string>([">=", ">", "<=", "<", "==", "!="]);

/** The Arabic the pane shows when a story is beyond the visual writer. */
export const ADVANCED_STORY_MESSAGE =
  "هذه القصة تحتوي عناصر متقدّمة لا يعرضها المحرّر المرئي. افتح المحرّر النصّي لتراها كاملة.";

class Unsupported extends Error {}

function reject(what: string): never {
  throw new Unsupported(what);
}

// ---- Variables → tags and counters ----------------------------------------

interface VarKinds {
  tags: string[];
  counters: { name: string; initial: number }[];
}

function readVariables(story: StoryJSON): VarKinds {
  const tags: string[] = [];
  const counters: { name: string; initial: number }[] = [];

  for (const [name, decl] of Object.entries(story.variables ?? {})) {
    if (decl.type === "boolean") {
      // A tag starts absent. One that starts raised has no checkbox to show it.
      if (decl.initial !== false) reject(`المتغير ${name} يبدأ بقيمة صح`);
      tags.push(name);
    } else if (decl.type === "number") {
      counters.push({ name, initial: Number(decl.initial) });
    } else {
      reject(`المتغير ${name} نصّي`);
    }
  }

  return { tags, counters };
}

// ---- Conditions ------------------------------------------------------------

function readCondition(cond: Condition, kinds: VarKinds): WriterCondition {
  if ("not" in cond) {
    // The parser inverts a negated comparison in place (`لا س < 3` becomes
    // `س >= 3`), so the only shape that reaches here is a bare `{not:{var}}`.
    const inner = cond.not as { var?: string; op?: string };
    if (typeof inner.var !== "string" || inner.op !== undefined) {
      reject("شرط منفيّ مركّب");
    }
    const name = inner.var;
    if (!kinds.tags.includes(name)) reject(`شرط على ${name} وليس أثرًا`);
    return { kind: "tag", tag: name, present: false };
  }
  if ("and" in cond || "or" in cond) reject("شرط مركّب بـ و / أو");

  const v = cond as { var: string; op?: string; value?: unknown };
  if (v.op === undefined) {
    if (!kinds.tags.includes(v.var)) reject(`شرط على ${v.var} وليس أثرًا`);
    return { kind: "tag", tag: v.var, present: true };
  }
  if (!COUNTER_OPS.has(v.op) || typeof v.value !== "number") {
    reject(`مقارنة غير مدعومة على ${v.var}`);
  }
  if (!kinds.counters.some((c) => c.name === v.var)) {
    reject(`مقارنة على ${v.var} وليس عدّادًا`);
  }
  return { kind: "counter", counter: v.var, op: v.op as CounterOp, value: v.value as number };
}

// ---- Prose -----------------------------------------------------------------

/**
 * Text nodes → the string an author sees in a textarea.
 *
 * `{value: null}` is PHASE1_SPEC §1.16's line break inside a paragraph; two
 * adjacent prose strings are a paragraph boundary. Reversing that is what makes
 * a textarea's plain newlines survive the trip through the compiler.
 */
function readProse(nodes: ContentNode[]): string {
  let out = "";
  let lastWasProse = false;
  for (const node of nodes) {
    if (node.type !== "text") continue;
    if (node.value === null) {
      out += "\n";
      lastWasProse = false;
      continue;
    }
    if (lastWasProse) out += "\n\n";
    out += node.value;
    lastWasProse = true;
  }
  return out;
}

// ---- Choices ---------------------------------------------------------------

function readChoice(
  item: ChoiceItem,
  kinds: VarKinds,
  sceneIdByPassage: Map<string, string>,
): Choice {
  const choice: Choice = {
    id: nextId("c"),
    label: item.label,
    destination: null,
    proseAfter: "",
    setTag: null,
    addToCounter: null,
    requires: item.condition ? readCondition(item.condition, kinds) : null,
    consumable: !item.sticky,
  };

  const textNodes: ContentNode[] = [];
  for (const node of item.content) {
    if (node.type === "text") { textNodes.push(node); continue; }
    if (node.type === "set") {
      if (node.value === true && (node.op === "=" || node.op === undefined)) {
        if (!kinds.tags.includes(node.var)) reject(`إسناد إلى ${node.var} وليس أثرًا`);
        if (choice.setTag) reject("خيار يرفع أكثر من أثر");
        choice.setTag = node.var;
        continue;
      }
      if (node.op === "+=" && typeof node.value === "number") {
        if (!kinds.counters.some((c) => c.name === node.var)) {
          reject(`زيادة على ${node.var} وليس عدّادًا`);
        }
        if (choice.addToCounter) reject("خيار يزيد أكثر من عدّاد");
        choice.addToCounter = { counter: node.var, amount: node.value };
        continue;
      }
      reject(`إسناد غير مدعوم على ${node.var}`);
    }
    reject(`عنصر ${node.type} داخل خيار`);
  }
  choice.proseAfter = readProse(textNodes);

  if (item.divert === "END") {
    choice.destination = END_DESTINATION;
  } else if (item.divert) {
    const target = sceneIdByPassage.get(item.divert);
    if (!target) reject(`الخيار ينتقل إلى ${item.divert}`);
    choice.destination = target;
  }

  return choice;
}

// ---- Passage ---------------------------------------------------------------

/**
 * A passage the visual writer can draw looks like this, in this order:
 * prose, then conditional texts, then either choices or a single divert.
 * Interleaving them differently is a story the pane would silently reorder,
 * so it is rejected instead.
 */
function readScene(
  name: string,
  content: ContentNode[],
  kinds: VarKinds,
  sceneIdByPassage: Map<string, string>,
  id: string,
): Scene {
  const scene: Scene = {
    id,
    title: name,
    image: null,
    prose: "",
    choices: [],
    conditionalTexts: [],
    autoDivert: null,
    isEnding: false,
  };

  type Stage = "image" | "prose" | "conditional" | "choices" | "divert";
  const rank: Record<Stage, number> = { image: 0, prose: 1, conditional: 2, choices: 3, divert: 4 };
  let stage = 0;
  const proseNodes: ContentNode[] = [];

  const enter = (s: Stage) => {
    if (rank[s] < stage) reject(`ترتيب غير مدعوم في المقطع ${name}`);
    stage = rank[s];
  };

  for (const node of content) {
    switch (node.type) {
      case "image":
        // First node only. The card shows one picture at the top of the scene;
        // an image further down renders further down, and quietly hoisting it
        // would change the story rather than describe it.
        if (scene.image !== null || stage > rank.image) {
          reject(`صورة في غير أوّل المقطع ${name}`);
        }
        enter("image");
        scene.image = (node as { name: string }).name;
        break;

      case "text":
        enter("prose");
        proseNodes.push(node);
        break;

      case "conditional": {
        enter("conditional");
        if (node.else.length > 0) reject(`شرط متعدّد الفروع في المقطع ${name}`);
        const then = node.then;
        if (then.length !== 1 || then[0]!.type !== "text" || then[0]!.value === null) {
          reject(`نصّ مشروط مركّب في المقطع ${name}`);
        }
        const ct: ConditionalText = {
          id: nextId("t"),
          text: (then[0] as { value: string }).value,
          condition: readCondition(node.condition, kinds),
        };
        scene.conditionalTexts.push(ct);
        break;
      }

      case "choices":
        enter("choices");
        if (scene.choices.length > 0) reject(`مجموعتا خيارات في المقطع ${name}`);
        scene.choices = node.items.map((item) => readChoice(item, kinds, sceneIdByPassage));
        break;

      case "divert": {
        enter("divert");
        if (scene.choices.length > 0) reject(`انتقال بعد الخيارات في المقطع ${name}`);
        if (node.target === "END") {
          scene.isEnding = true;
        } else {
          const target = sceneIdByPassage.get(node.target);
          if (!target) reject(`انتقال إلى ${node.target}`);
          scene.autoDivert = target;
        }
        break;
      }

      default:
        reject(`عنصر ${node.type} في المقطع ${name}`);
    }
  }

  scene.prose = readProse(proseNodes);
  return scene;
}

// ---- Entry point -----------------------------------------------------------

/**
 * Rebuild the writer state from a compiled story, or explain why not.
 *
 * `reason` is Arabic and specific — "شرط متعدّد الفروع في المقطع المهمّة", not
 * "unsupported" — because the author needs to know which part of their story
 * the form cannot show before deciding whether to open the code editor.
 */
export function importSingleScene(
  story: StoryJSON,
  passageName: string,
  kinds: { tags: string[]; counters: { name: string; initial: number }[] },
  passageToSceneId: Map<string, string>,
  sceneId: string,
): { ok: true; scene: Scene } | { ok: false; reason: string } {
  try {
    const passage = story.passages[passageName];
    if (!passage) reject(`لا يوجد مقطع باسم ${passageName}`);
    return {
      ok: true,
      scene: readScene(passageName, passage.content, kinds, passageToSceneId, sceneId),
    };
  } catch (err) {
    if (err instanceof Unsupported) return { ok: false, reason: err.message };
    throw err;
  }
}

export function importWriterState(story: StoryJSON): ImportResult {
  try {
    if (Object.keys(story.lists ?? {}).length > 0) reject("القصة تستخدم القوائم");

    const kinds = readVariables(story);

    const names = Object.keys(story.passages ?? {});
    for (const name of names) {
      if (name.includes(".")) reject(`المقطع ${name} يحتوي أقسامًا فرعية`);
    }
    // The start passage is the first one declared; keep that true on the way
    // back, or the story would silently start somewhere else.
    if (story.start && names[0] !== story.start) {
      const i = names.indexOf(story.start);
      if (i > 0) names.unshift(...names.splice(i, 1));
    }

    const sceneIdByPassage = new Map<string, string>();
    for (const name of names) sceneIdByPassage.set(name, nextId("s"));

    const scenes = names.map((name) =>
      readScene(
        name,
        story.passages[name]!.content,
        kinds,
        sceneIdByPassage,
        sceneIdByPassage.get(name)!,
      ),
    );

    const state: WriterState = {
      ...emptyWriterState(),
      title: story.title ?? "",
      author: story.author ?? "",
      scenes,
      tags: kinds.tags,
      counters: kinds.counters,
      images: Object.entries(story.images ?? {}).map(([name, decl]) => ({
        name,
        description: decl.alt ?? "",
      })),
      // `imageStyle` is emitted by the compiler but is not on the runtime's
      // published StoryJSON type, so it is read structurally rather than by
      // widening a package this phase is not allowed to touch.
      imageStyle:
        typeof (story as unknown as { imageStyle?: unknown }).imageStyle === "string"
          ? (story as unknown as { imageStyle: string }).imageStyle
          : "",
      // Many `أوصاف_الشخصيات` lines become one box again. Joining with "\n" is
      // what makes the round trip byte-identical: the box is re-split on the
      // way back out.
      characters: Array.isArray(
        (story as unknown as { characters?: unknown }).characters,
      )
        ? (story as unknown as { characters: unknown[] })
            .characters.filter((c): c is string => typeof c === "string")
            .join("\n")
        : "",
    };
    return { ok: true, state };
  } catch (err) {
    if (err instanceof Unsupported) return { ok: false, reason: err.message };
    throw err;
  }
}

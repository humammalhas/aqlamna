// ---------------------------------------------------------------------------
// Visual Writer — the state model.
//
// This is what a story looks like to somebody who never sees `.qalam`. Scenes
// hold prose and choices; a "tag" (أثر) is a boolean flag; a "counter" (عدّاد)
// is a number. Nothing here knows about `===`, `->`, `~` or `{ }` — that
// knowledge lives in `generate-qalam.ts` and nowhere else.
//
// Two deliberate departures from VISUAL_WRITER_SPEC.md, both recorded here so
// nobody has to guess later:
//
//   1. A choice's `destination` is a scene **id**, not a scene title. The spec
//      said title. Titles are what the author renames; ids are not. Keying on
//      the title means renaming one scene silently dangles every link into it
//      and the story stops compiling — exactly the class of breakage the visual
//      writer exists to prevent.
//   2. The word for a scene is **مقطع**, not مشهد. The spec's mock-up says
//      مشهد, but the language's own error messages, the docs (205 uses against
//      45) and the landing page all say مقطع. CLAUDE.md's rule from the last
//      naming sweep is "grep the UI before naming anything in copy"; this is
//      that grep being obeyed.
// ---------------------------------------------------------------------------

/** Sentinel destination meaning `-> نهاية`. Scene ids are `s<n>`, so no clash. */
export const END_DESTINATION = "END";

export type CounterOp = ">=" | ">" | "<=" | "<" | "==" | "!=";

/** Every comparison the author can pick, with its Arabic reading. */
export const COUNTER_OPS: ReadonlyArray<{ op: CounterOp; label: string }> = [
  { op: ">=", label: "أكبر من أو يساوي" },
  { op: ">", label: "أكبر من" },
  { op: "==", label: "يساوي" },
  { op: "!=", label: "لا يساوي" },
  { op: "<=", label: "أصغر من أو يساوي" },
  { op: "<", label: "أصغر من" },
];

export interface Counter {
  name: string;
  initial: number;
}

export type WriterCondition =
  | { kind: "tag"; tag: string; present: boolean }
  | { kind: "counter"; counter: string; op: CounterOp; value: number };

export interface Choice {
  id: string;
  /** What the reader clicks. */
  label: string;
  /** Scene id, `END_DESTINATION`, or null when the author has not chosen yet. */
  destination: string | null;
  /** Prose shown after the choice is taken, before the story moves on. */
  proseAfter: string;
  /** Tag to raise when this choice is taken. */
  setTag: string | null;
  /** Counter to add to when this choice is taken. */
  addToCounter: { counter: string; amount: number } | null;
  /** Gate: the choice only appears when this holds. */
  requires: WriterCondition | null;
  /** true → `*` (disappears once taken); false → `+` (stays). */
  consumable: boolean;
}

export interface ConditionalText {
  id: string;
  text: string;
  condition: WriterCondition;
}

export interface Scene {
  id: string;
  title: string;
  prose: string;
  choices: Choice[];
  conditionalTexts: ConditionalText[];
  /** Where a scene with no choices goes next. Scene id or null. */
  autoDivert: string | null;
  /** true → `-> نهاية`, and `autoDivert` is ignored. */
  isEnding: boolean;
}

export interface WriterState {
  title: string;
  author: string;
  scenes: Scene[];
  tags: string[];
  counters: Counter[];
}

// ---- Ids -------------------------------------------------------------------
//
// Sequential, not random: `Math.random()` and `Date.now()` would make the
// generated source differ between two runs over the same story, and the
// generated source is what gets saved and diffed.

let idCounter = 0;

export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

/** Reset the id counter. Only for tests that assert on generated ids. */
export function resetIds(): void {
  idCounter = 0;
}

// ---- Constructors ----------------------------------------------------------

export function emptyScene(title: string): Scene {
  return {
    id: nextId("s"),
    title,
    prose: "",
    choices: [],
    conditionalTexts: [],
    autoDivert: null,
    isEnding: false,
  };
}

export function emptyChoice(): Choice {
  return {
    id: nextId("c"),
    label: "",
    destination: null,
    proseAfter: "",
    setTag: null,
    addToCounter: null,
    requires: null,
    consumable: false,
  };
}

export function emptyConditionalText(tag: string | null): ConditionalText {
  return {
    id: nextId("t"),
    text: "",
    condition: { kind: "tag", tag: tag ?? "", present: true },
  };
}

export function emptyWriterState(): WriterState {
  return { title: "", author: "", scenes: [], tags: [], counters: [] };
}

/**
 * A brand-new story: one scene, so the pane never opens on nothing at all.
 * The title is the same word the docs use for a first scene.
 */
export function starterWriterState(): WriterState {
  return { title: "", author: "", scenes: [emptyScene("البداية")], tags: [], counters: [] };
}

// ---- Arabic-Indic digits ---------------------------------------------------

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** `3` → `٣`. Used for auto-generated scene names, never for the source. */
export function arabicNumber(n: number): string {
  return String(n)
    .split("")
    .map((d) => ARABIC_DIGITS[Number(d)] ?? d)
    .join("");
}

/** The next unused auto title: مقطع ٢, مقطع ٣, … */
export function nextSceneTitle(scenes: Scene[]): string {
  const taken = new Set(scenes.map((s) => s.title.trim()));
  for (let n = scenes.length + 1; ; n++) {
    const candidate = `مقطع ${arabicNumber(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

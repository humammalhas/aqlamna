// ---------------------------------------------------------------------------
// Visual Writer → `.qalam` source.
//
// This file is the ONLY place in the visual writer that knows the language's
// syntax. Everything above it deals in scenes, choices, tags and counters.
//
// Two invariants it exists to hold:
//
//   1. **The output always compiles.** An author typing ordinary Arabic prose
//      must never produce a parse error. Ordinary prose contains things the
//      tokenizer reads as structure — a line beginning `صورة الجدّة…` is a CODE
//      line because `صورة` is the image keyword, and a line beginning `* ` is a
//      choice. `sanitizeProse` neutralises those WITHOUT altering a visible
//      character: it prefixes U+2060 WORD JOINER, which is zero-width, is not
//      Unicode White_Space (so `String.trim()` keeps it), and makes
//      `peekLineMode` fall through to TEXT. Braces and `->` have no such trick
//      — the tokenizer breaks on them mid-line — so those are substituted, and
//      `describeProseFixes` reports the substitution so the change is never
//      silent.
//
//   2. **Renaming a scene never breaks a link.** Choices store scene ids;
//      passage names are derived here, at generation time.
// ---------------------------------------------------------------------------

import {
  END_DESTINATION,
  type Choice,
  type ConditionalText,
  type Scene,
  type WriterCondition,
  type WriterState,
} from "./writer-model.js";

// ---- Identifier normalisation ---------------------------------------------

/**
 * Words the tokenizer classifies as keywords rather than identifiers. A scene,
 * tag or counter carrying one of these names would tokenize as a keyword and
 * the story would not parse — so a suffix is added instead.
 *
 * `لا` / `و` / `أو` / `غير_ذلك` are keywords only inside `{ }`, which is
 * precisely where a tag or counter name appears, so they are excluded too.
 */
const RESERVED = new Set([
  "عنوان", "TITLE", "مؤلف", "AUTHOR", "لغة", "LANGUAGE",
  "متغير", "VAR", "قائمة", "LIST",
  "صورة", "image", "أسلوب_الصور", "image_style",
  "صح", "true", "خطأ", "false",
  "نهاية", "END", "تابع", "DONE",
  "لا", "not", "و", "and", "أو", "or", "غير_ذلك", "else",
]);

/** U+064B–U+0652 harakat plus U+0640 tatweel — exactly what the tokenizer drops. */
const TASHKEEL = /[\u064B-\u0652\u0640]/g;

/**
 * Characters the tokenizer accepts inside an identifier, copied from
 * `isIdentStart`/`isIdentContinue`: Arabic letters, Latin letters, both digit
 * sets and `_`. The dot is deliberately absent — it is legal in an identifier
 * but means "sub-section", so a scene called `أ.ب` would compile to a divert
 * into a sub-section that does not exist.
 */
const IDENT_OK =
  /[\u0620-\u064A\u066E-\u066F\u0671-\u06D3\u06D5\u06FA-\u06FC\u06FFA-Za-z0-9\u0660-\u0669_]/;

/** A free-text name → an identifier the tokenizer will read back unchanged. */
export function toIdentifier(name: string, fallback: string): string {
  const stripped = name.replace(TASHKEEL, "");
  let out = "";
  for (const ch of stripped) {
    out += IDENT_OK.test(ch) ? ch : "_";
  }
  out = out.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (out.length === 0) return fallback;
  // `isIdentStart` is letters and `_` only — a leading digit would tokenize as
  // a NUMBER followed by a stray identifier.
  if (/^[0-9]/.test(out)) out = `_${out}`;
  if (RESERVED.has(out)) out = `${out}_`;
  return out;
}

/** Make every name in `names` a distinct identifier, in order. */
function uniqueIdentifiers(names: string[], fallbackPrefix: string): string[] {
  const used = new Set<string>();
  return names.map((name, i) => {
    const base = toIdentifier(name, `${fallbackPrefix}_${i + 1}`);
    if (!used.has(base)) { used.add(base); return base; }
    for (let n = 2; ; n++) {
      const candidate = `${base}_${n}`;
      if (!used.has(candidate)) { used.add(candidate); return candidate; }
    }
  });
}

/** Scene id → passage identifier, plus tag and counter identifiers. */
export interface NameMap {
  scene: Map<string, string>;
  tag: Map<string, string>;
  counter: Map<string, string>;
}

export function buildNameMap(state: WriterState): NameMap {
  const sceneNames = uniqueIdentifiers(state.scenes.map((s) => s.title), "مقطع");
  const tagNames = uniqueIdentifiers(state.tags, "أثر");
  const counterNames = uniqueIdentifiers(state.counters.map((c) => c.name), "عداد");

  const scene = new Map<string, string>();
  state.scenes.forEach((s, i) => scene.set(s.id, sceneNames[i]!));
  const tag = new Map<string, string>();
  state.tags.forEach((t, i) => tag.set(t, tagNames[i]!));
  const counter = new Map<string, string>();
  state.counters.forEach((c, i) => counter.set(c.name, counterNames[i]!));

  return { scene, tag, counter };
}

// ---- Prose safety ----------------------------------------------------------

/** U+2060 WORD JOINER — zero-width, invisible, and not `String.trim()`-able. */
const WJ = "\u2060";

/** Words that make `peekLineMode` treat a whole line as CODE. */
const LINE_START_KEYWORDS = new Set([
  "عنوان", "TITLE", "مؤلف", "AUTHOR", "لغة", "LANGUAGE",
  "متغير", "VAR", "قائمة", "LIST",
  "صورة", "image", "أسلوب_الصور", "image_style",
]);

function startsLikeCode(line: string): boolean {
  const t = line.replace(/^[ \t]+/, "");
  if (t.length === 0) return false;
  const c = t[0]!;
  if (c === "*" || c === "+" || c === "~" || c === "=") return true;
  if (t.startsWith("->") || t.startsWith("<-")) return true;
  if (t.startsWith("//") || t.startsWith("/*")) return true;
  const word = t.match(/^[\u0620-\u06FFA-Za-z_][\u0620-\u06FFA-Za-z0-9_.]*/);
  if (word && LINE_START_KEYWORDS.has(word[0]!.replace(TASHKEEL, ""))) return true;
  return false;
}

/**
 * Make an author's prose safe to drop into a `.qalam` body.
 *
 * Braces and `->` are substituted for their nearest visible equivalent; a
 * structural line start gets an invisible U+2060 and keeps every character the
 * author typed. `describeProseFixes` reports the substitutions.
 */
export function sanitizeProse(text: string): string {
  const substituted = text
    .replace(/->/g, "→")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")");
  return substituted
    .split("\n")
    .map((line) => (startsLikeCode(line) ? WJ + line : line))
    .join("\n");
}

/** Arabic notes about what `sanitizeProse` would change. Empty when nothing. */
export function describeProseFixes(text: string): string[] {
  const notes: string[] = [];
  if (/\{|\}/.test(text)) notes.push("استُبدلت الأقواس { } بأقواس عادية ( ) لأنّ اللغة تحجزها للشروط.");
  if (/->/.test(text)) notes.push("استُبدل السهم -> بالسهم → لأنّ اللغة تحجزه للانتقال.");
  return notes;
}

/** A choice label is scanned raw up to `]`, so only `]` and newlines can break it. */
export function sanitizeLabel(label: string): string {
  return label.replace(/[\r\n]+/g, " ").replace(/]/g, "").trim();
}

/** Conditional text lives on one line between `{ … }`. */
function sanitizeInlineText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/->/g, "→")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .trim();
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ---- Condition rendering ---------------------------------------------------

function renderCondition(cond: WriterCondition, names: NameMap): string | null {
  if (cond.kind === "tag") {
    const id = names.tag.get(cond.tag);
    if (!id) return null;
    return cond.present ? id : `لا ${id}`;
  }
  const id = names.counter.get(cond.counter);
  if (!id) return null;
  return `${id} ${cond.op} ${cond.value}`;
}

// ---- Body pieces -----------------------------------------------------------

function renderConditionalText(ct: ConditionalText, names: NameMap): string | null {
  const expr = renderCondition(ct.condition, names);
  const body = sanitizeInlineText(ct.text);
  if (!expr || body.length === 0) return null;
  return `{${expr}: ${body}}`;
}

function renderChoice(choice: Choice, names: NameMap, indent: string): string[] {
  const lines: string[] = [];
  const marker = choice.consumable ? "*" : "+";
  const gate = choice.requires ? renderCondition(choice.requires, names) : null;
  const label = sanitizeLabel(choice.label) || "…";

  lines.push(gate ? `${marker} {${gate}} [${label}]` : `${marker} [${label}]`);

  const prose = sanitizeProse(choice.proseAfter).trim();
  if (prose.length > 0) {
    for (const line of prose.split("\n")) {
      lines.push(line.trim().length === 0 ? "" : indent + line.trim());
    }
  }

  if (choice.setTag) {
    const id = names.tag.get(choice.setTag);
    if (id) lines.push(`${indent}~ ${id} = صح`);
  }

  if (choice.addToCounter && choice.addToCounter.amount !== 0) {
    const id = names.counter.get(choice.addToCounter.counter);
    if (id) {
      const amount = choice.addToCounter.amount;
      const op = amount < 0 ? "-" : "+";
      lines.push(`${indent}~ ${id} = ${id} ${op} ${Math.abs(amount)}`);
    }
  }

  if (choice.destination === END_DESTINATION) {
    lines.push(`${indent}-> نهاية`);
  } else if (choice.destination) {
    const target = names.scene.get(choice.destination);
    // A destination pointing at a deleted scene is dropped rather than emitted:
    // an unknown target is E101, and a compile error is a worse answer than a
    // choice that simply carries on inside the same scene. The pane's own
    // validation names it instead.
    if (target) lines.push(`${indent}-> ${target}`);
  }

  return lines;
}

function renderScene(scene: Scene, names: NameMap): string[] {
  const lines: string[] = [];
  const passage = names.scene.get(scene.id)!;
  lines.push(`=== ${passage} ===`);
  lines.push("");

  const prose = sanitizeProse(scene.prose).replace(/\s+$/, "");
  if (prose.trim().length > 0) {
    for (const line of prose.split("\n")) lines.push(line.trimEnd());
    lines.push("");
  }

  let wroteConditional = false;
  for (const ct of scene.conditionalTexts) {
    const rendered = renderConditionalText(ct, names);
    if (rendered) { lines.push(rendered); wroteConditional = true; }
  }
  if (wroteConditional) lines.push("");

  if (scene.choices.length > 0) {
    scene.choices.forEach((choice, i) => {
      if (i > 0) lines.push("");
      lines.push(...renderChoice(choice, names, "  "));
    });
    lines.push("");
  } else if (scene.isEnding) {
    lines.push("-> نهاية");
    lines.push("");
  } else if (scene.autoDivert === END_DESTINATION) {
    lines.push("-> نهاية");
    lines.push("");
  } else if (scene.autoDivert) {
    const target = names.scene.get(scene.autoDivert);
    if (target) { lines.push(`-> ${target}`); lines.push(""); }
  }

  return lines;
}

// ---- Entry point -----------------------------------------------------------

/**
 * Serialise the whole writer state to `.qalam` source.
 *
 * Pure: same state in, same bytes out. No clock, no randomness — the result is
 * saved to IndexedDB on every keystroke and a non-deterministic generator would
 * rewrite the story while the author sat still.
 */
export function generateQalam(state: WriterState): string {
  const names = buildNameMap(state);
  const lines: string[] = [];

  if (state.title.trim()) lines.push(`عنوان: ${quote(state.title.trim())}`);
  if (state.author.trim()) lines.push(`مؤلف: ${quote(state.author.trim())}`);
  if (lines.length > 0) lines.push("");

  const declared: string[] = [];
  for (const tag of state.tags) {
    const id = names.tag.get(tag);
    if (id) declared.push(`متغير ${id} = خطأ`);
  }
  for (const counter of state.counters) {
    const id = names.counter.get(counter.name);
    if (id) declared.push(`متغير ${id} = ${Math.trunc(counter.initial) || 0}`);
  }
  if (declared.length > 0) { lines.push(...declared); lines.push(""); }

  for (const scene of state.scenes) {
    lines.push(...renderScene(scene, names));
  }

  // One trailing newline, no run of blank lines at the end.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

// ---- Validation ------------------------------------------------------------

export interface WriterIssue {
  sceneId: string;
  choiceId?: string;
  message: string;
}

/**
 * Problems the language cannot report because the generated source is still
 * valid: a choice with no destination, a scene nothing reaches, a story that
 * never ends. These are the visual writer's own errors, in Arabic, shown in
 * the pane rather than the compile-error strip.
 */
export function validateWriterState(state: WriterState): WriterIssue[] {
  const issues: WriterIssue[] = [];
  const ids = new Set(state.scenes.map((s) => s.id));

  for (const scene of state.scenes) {
    if (scene.title.trim().length === 0) {
      issues.push({ sceneId: scene.id, message: "هذا المقطع دون اسم." });
    }

    for (const choice of scene.choices) {
      if (sanitizeLabel(choice.label).length === 0) {
        issues.push({ sceneId: scene.id, choiceId: choice.id, message: "خيار دون نصّ يقرأه القارئ." });
      }
      if (!choice.destination) {
        issues.push({ sceneId: scene.id, choiceId: choice.id, message: "خيار دون وجهة؛ اختر المقطع الذي ينتقل إليه." });
      } else if (choice.destination !== END_DESTINATION && !ids.has(choice.destination)) {
        issues.push({ sceneId: scene.id, choiceId: choice.id, message: "وجهة هذا الخيار مقطع محذوف." });
      }
    }

    if (scene.choices.length === 0 && !scene.isEnding) {
      if (!scene.autoDivert) {
        issues.push({ sceneId: scene.id, message: "مقطع دون خيارات ودون وجهة؛ تنتهي القصة هنا فجأة." });
      } else if (scene.autoDivert !== END_DESTINATION && !ids.has(scene.autoDivert)) {
        issues.push({ sceneId: scene.id, message: "وجهة هذا المقطع مقطع محذوف." });
      }
    }
  }

  // Unreachable scenes. The first scene is the start, so it is always reached.
  const reached = new Set<string>();
  if (state.scenes.length > 0) reached.add(state.scenes[0]!.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const scene of state.scenes) {
      if (!reached.has(scene.id)) continue;
      const targets = [
        ...scene.choices.map((c) => c.destination),
        scene.choices.length === 0 ? scene.autoDivert : null,
      ];
      for (const t of targets) {
        if (t && t !== END_DESTINATION && ids.has(t) && !reached.has(t)) {
          reached.add(t);
          changed = true;
        }
      }
    }
  }
  for (const scene of state.scenes) {
    if (!reached.has(scene.id)) {
      issues.push({ sceneId: scene.id, message: "لا يصل القارئ إلى هذا المقطع من أيّ خيار." });
    }
  }

  return issues;
}

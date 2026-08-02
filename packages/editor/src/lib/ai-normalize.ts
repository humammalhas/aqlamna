// ---------------------------------------------------------------------------
// What the model writes vs what the language accepts.
//
// Measured against DeepSeek (`deepseek-v4-flash`) with this project's own
// prompts, on 2 Aug 2026:
//
//   اكتب هذا المقطع  ended its scene with a numbered list —
//                    "ما الذي أفعل؟ / ١. أمشي نحو الضوء / ٢. أتوقّف وأنادي"
//                    which is prose to the compiler. The scene arrived with
//                    every choice sitting in the story box and `choices: []`.
//                    Reported from the live editor, twice, in those words.
//
//   اقترح خيارات     returned `* أتقدّم بحذر` with NO brackets, although the
//                    prompt shows `* [نص الخيار]`. The parser requires them, so
//                    the whole suggestion was refused and the author saw
//                    "لم يتّسق اقتراح الذكاء الاصطناعي مع قصتك" — for a
//                    suggestion that was perfectly good writing.
//
// Tightening the prompt makes both rarer; it cannot make either impossible,
// because the model is not bound by it and there are eleven providers behind
// this button. So the shape is repaired here, once, before anything compiles
// it. Nothing is invented: every label is text the model actually wrote.
// ---------------------------------------------------------------------------

/** `* something` / `+ something` where `something` is not already bracketed. */
const BARE_MARKER = /^(\s*)([*+])\s+(?!\[)(.+?)\s*$/;

/** A list item: `1.` `١)` `-` `•` — the shape a model reaches for unprompted. */
const LIST_ITEM = /^\s*(?:[-–—•]|(?:[0-9]{1,2}|[٠-٩]{1,2})\s*[.)\-–])\s+(.+?)\s*$/;

/** A heading that only introduces the list — noise once the list is choices. */
const LIST_HEADING = /^\s*(?:الخيارات|الاختيارات|اختر(?:\s+أحد\s+الخيارات)?)\s*[:：]?\s*$/;

/** Trailing sentence punctuation on a button label reads as a typo. */
function asLabel(text: string): string {
  return text.replace(/[.،]\s*$/, "").trim();
}

/**
 * Repair a fragment into syntax `@aqlamna/core` accepts, without changing a
 * word of it.
 *
 * Two repairs, both conservative:
 *
 *   1. A choice marker whose label is not bracketed gets brackets.
 *   2. A list at the END of the fragment — two or more items, nothing but
 *      blank lines between them — becomes choices. Only at the end, and only
 *      two or more, so a list inside the prose of a scene is left alone.
 *
 * A fragment that is already valid comes back byte-identical.
 */
export function normalizeChoiceSyntax(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  // ---- 1. bare markers ------------------------------------------------------
  let out = lines.map((line) => {
    const m = line.match(BARE_MARKER);
    if (!m) return line;
    // A divert or a condition after the marker is structure, not a label.
    if (/^(?:->|<-|\{)/.test(m[3]!)) return line;
    return `${m[1]}${m[2]} [${asLabel(m[3]!)}]`;
  });

  // ---- 2. a trailing list ---------------------------------------------------
  let end = out.length;
  while (end > 0 && out[end - 1]!.trim() === "") end--;

  let start = end;
  let items = 0;
  for (let i = end - 1; i >= 0; i--) {
    const line = out[i]!;
    if (line.trim() === "") {
      // Blank lines are allowed between items, but not before the first one.
      if (items === 0) break;
      continue;
    }
    if (!LIST_ITEM.test(line)) break;
    start = i;
    items++;
  }

  if (items >= 2) {
    const converted: string[] = [];
    for (let i = start; i < end; i++) {
      const line = out[i]!;
      if (line.trim() === "") continue;
      const m = line.match(LIST_ITEM)!;
      converted.push(`* [${asLabel(m[1]!)}]`);
    }

    // Drop a heading that exists only to introduce the list.
    let head = start;
    while (head > 0 && out[head - 1]!.trim() === "") head--;
    if (head > 0 && LIST_HEADING.test(out[head - 1]!)) head--;

    out = [...out.slice(0, head), "", ...converted, ...out.slice(end)];
  }

  return out.join("\n");
}

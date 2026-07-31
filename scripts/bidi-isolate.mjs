// ---------------------------------------------------------------------------
// bidi-isolate.mjs — make ASCII operator runs render left-to-right inside RTL.
//
// `direction: rtl` plus `unicode-bidi: isolate` does NOT force LTR *inside* a
// run. `-` and `>` are both bidi-neutral, so in an RTL paragraph the pair `->`
// resolves right-to-left and paints as `<-`. Measured on the live docs:
// '>' at x=1023, '-' at x=1033 — the arrow pointed the wrong way in every
// code sample on the site.
//
// CSS alone cannot fix this: the isolate has to wrap the run, and only the
// producer of the markup knows where the runs are. So every generator of code
// HTML wraps maximal runs of printable ASCII in `<span dir="ltr">`.
//
// The same rule is implemented for CodeMirror in
// packages/editor/src/qalam/qalam-bidi.ts. A test asserts the two patterns are
// character-identical — see packages/editor/tests/bidi-pattern.spec.ts.
// ---------------------------------------------------------------------------

/**
 * A maximal run of printable ASCII (U+0021–U+007E): operators, brackets,
 * Latin words, digits — and HTML entities, which are themselves printable
 * ASCII and so stay inside one run. `&gt;=` must never be split into `&gt;`
 * and `=`, or the two isolates reorder and the bug comes back.
 */
export const ASCII_RUN_SOURCE = "[!-~]+";

/**
 * Wrap every printable-ASCII run of an ALREADY HTML-ESCAPED string in an LTR
 * isolate. Call this after escaping, never before — it emits markup.
 */
export function isolateAscii(escaped) {
  return escaped.replace(
    new RegExp(ASCII_RUN_SOURCE, "g"),
    (run) => `<span dir="ltr">${run}</span>`,
  );
}

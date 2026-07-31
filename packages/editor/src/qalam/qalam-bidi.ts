// ---------------------------------------------------------------------------
// Bidi isolation ViewPlugin — wraps every run of printable ASCII in a mark
// decoration with `direction: ltr; unicode-bidi: isolate`, so operators render
// as typed instead of being reordered by the browser's bidi algorithm.
//
// The previous version isolated ONE CHARACTER AT A TIME. Two adjacent isolates
// are themselves reordered by the surrounding RTL paragraph, so `->` became
// `-` and `>` in separate isolates and painted as `<-`. Isolating the whole
// run is the fix: the run keeps its internal LTR order.
//
// The same rule is implemented for generated HTML in scripts/bidi-isolate.mjs.
// tests/bidi-pattern.spec.ts asserts the two patterns are identical.
// ---------------------------------------------------------------------------

import { ViewPlugin, Decoration, type DecorationSet } from "@codemirror/view";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";

/**
 * A maximal run of printable ASCII (U+0021–U+007E): `->`, `->->`, `<-`, `!=`,
 * `>=`, `<=`, `==`, `===`, `**`, `[`, `]`, `.qalam`, `TITLE:`, digits.
 * Anything Arabic, and every space, ends the run — so Arabic keeps its own
 * direction and only the ASCII is pinned LTR.
 */
export const ASCII_RUN_SOURCE = "[!-~]+";

const bidiMark = Decoration.mark({
  attributes: {
    style: "direction: ltr; unicode-bidi: isolate;",
  },
});

function computeDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc.toString();
  // A fresh regex per call: a shared /g regex carries lastIndex between calls
  // and silently skips matches on the second pass.
  const pattern = new RegExp(ASCII_RUN_SOURCE, "g");

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(doc)) !== null) {
    builder.add(match.index, match.index + match[0].length, bidiMark);
  }

  return builder.finish();
}

const bidiPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: { state: EditorState }) {
      this.decorations = computeDecorations(view.state);
    }

    update(update: {
      state: EditorState;
      docChanged: boolean;
      viewportChanged: boolean;
    }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = computeDecorations(update.state);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export function qalamBidiIsolation() {
  return bidiPlugin;
}

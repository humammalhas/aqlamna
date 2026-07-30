// ---------------------------------------------------------------------------
// Bidi isolation ViewPlugin — wraps operator/symbol runs in mark decorations
// with `direction: ltr; unicode-bidi: isolate` so that `>=` renders as typed
// and is not mirrored/reordered by the browser's bidi algorithm.
// ---------------------------------------------------------------------------

import { ViewPlugin, Decoration, type DecorationSet } from "@codemirror/view";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";

// ---- Operators / symbols to isolate ----------------------------------------

/**
 * Multi-character operators matched first so they are isolated as one unit.
 * Order matters: longer patterns before shorter ones.
 */
const MULTI_CHAR_OPS = [
  ">=", "<=", "==", "!=",
  "->->",
  "**",
  "===",
] as const;

/** Single-character symbols isolated individually. */
const SINGLE_CHAR_SYMBOLS = /[><=~{}\[\]+\-*]/g;

// Build a combined regex: multi-char patterns alternated, then single-char.
const OPS_PATTERN = new RegExp(
  [
    ...MULTI_CHAR_OPS.map((op) => op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    ".",
  ].join("|"),
  "g",
);

// ---- Decoration ------------------------------------------------------------

const bidiMark = Decoration.mark({
  attributes: {
    style: "direction: ltr; unicode-bidi: isolate;",
  },
});

// ---- ViewPlugin ------------------------------------------------------------

function computeDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = state.doc.toString();

  let match: RegExpExecArray | null;
  OPS_PATTERN.lastIndex = 0;
  while ((match = OPS_PATTERN.exec(doc)) !== null) {
    const text = match[0];
    // Only isolate if the text matches a known operator pattern
    if (isOperatorText(text)) {
      builder.add(match.index, match.index + text.length, bidiMark);
    }
  }

  return builder.finish();
}

function isOperatorText(s: string): boolean {
  return (
    MULTI_CHAR_OPS.includes(s as (typeof MULTI_CHAR_OPS)[number]) ||
    SINGLE_CHAR_SYMBOLS.test(s)
  );
}

const bidiPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: { state: EditorState }) {
      this.decorations = computeDecorations(view.state);
    }

    update(update: { state: EditorState; docChanged: boolean; viewportChanged: boolean }) {
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

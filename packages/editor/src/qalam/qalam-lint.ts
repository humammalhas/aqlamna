// ---------------------------------------------------------------------------
// Live-error lint source — compiles .qalam on a debounce and surfaces
// QalamErrors as CodeMirror diagnostics with the Arabic message.
// ---------------------------------------------------------------------------

import { linter, type Diagnostic } from "@codemirror/lint";
import { compile } from "@aqlamna/core";
import { isQalamError, type QalamError } from "../store.js";

/**
 * Convert a 1-based line:column to a 0-based document offset range.
 * Selects from the error column to the end of the line so the underline is
 * visible even if CodeMirror's bidi rendering shifts the visual column.
 */
function errorToDiagnostic(err: QalamError, doc: string): Diagnostic {
  const lines = doc.split("\n");
  const lineIdx = Math.min(Math.max(err.line - 1, 0), lines.length - 1);
  const line = lines[lineIdx] ?? "";

  // Compute byte offset of the start of this line
  let offset = 0;
  for (let i = 0; i < lineIdx; i++) {
    offset += (lines[i] ?? "").length + 1; // +1 for the newline
  }

  const col = Math.min(Math.max(err.column - 1, 0), line.length);
  const from = offset + col;

  // Underline from the error column to end of line
  const to = offset + line.length;

  return {
    from,
    to,
    severity: "error",
    message: err.message_ar,
  };
}

/**
 * CodeMirror lint extension that re-compiles the document on a debounce
 * and returns diagnostics for any QalamError found.
 */
export const qalamLinter = linter(
  (view) => {
    const doc = view.state.doc.toString();
    if (doc.trim().length === 0) return [];

    try {
      compile(doc, "editor.qalam");
      return [];
    } catch (err: unknown) {
      if (isQalamError(err)) {
        return [errorToDiagnostic(err, doc)];
      }
      // Non-QalamError (shouldn't happen, but surface it)
      return [
        {
          from: 0,
          to: doc.length,
          severity: "error",
          message:
            err instanceof Error ? err.message : "خطأ غير معروف / Unknown error",
        },
      ];
    }
  },
  { delay: 500 },
);

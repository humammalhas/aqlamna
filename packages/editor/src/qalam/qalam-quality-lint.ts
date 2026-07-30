// ---------------------------------------------------------------------------
// qalam-quality-lint.ts — CodeMirror lint extension that runs the Arabic
// quality linter on the document. Returns amber "warning" diagnostics
// visually distinct from compiler errors (which are red).
//
// Reads the linter toggle from the Zustand store directly so it stays
// reactive without recreating the extension.
// ---------------------------------------------------------------------------

import { linter, type Diagnostic as CMDiagnostic } from "@codemirror/lint";
import { lint as qualityLint } from "@aqlamna/linter";
import { useStore } from "../store.js";

/**
 * Convert a linter Diagnostic (1-based line:column) to a
 * CodeMirror Diagnostic (0-based document offset range).
 */
function qualityDiagToCM(
  diag: import("@aqlamna/linter").Diagnostic,
  doc: string,
): CMDiagnostic {
  const lines = doc.split("\n");
  const lineIdx = Math.min(Math.max(diag.line - 1, 0), lines.length - 1);
  const line = lines[lineIdx] ?? "";

  let offset = 0;
  for (let i = 0; i < lineIdx; i++) {
    offset += (lines[i] ?? "").length + 1;
  }

  const col = Math.min(Math.max(diag.column - 1, 0), line.length);
  const from = offset + col;
  const to = from + diag.length;

  return {
    from,
    to,
    severity: "warning",
    message: diag.messageAr,
    // If the rule has a suggestion, provide it as a quick-fix action
    ...(diag.suggestion
      ? {
          actions: [
            {
              name: `استبدل بـ "${diag.suggestion}"`,
              apply(view, fromPos, toPos) {
                view.dispatch({
                  changes: { from: fromPos, to: toPos, insert: diag.suggestion! },
                });
              },
            },
          ],
        }
      : {}),
  };
}

/**
 * CodeMirror lint extension that runs the quality linter on the document.
 * Checks `useStore.getState().qualityLintEnabled` on each invocation so the
 * toggle is reactive.
 */
export const qalamQualityLinter = linter(
  (view) => {
    if (!useStore.getState().qualityLintEnabled) return [];

    const doc = view.state.doc.toString();
    if (doc.trim().length === 0) return [];

    try {
      const diags = qualityLint(doc);
      return diags.map((d) => qualityDiagToCM(d, doc));
    } catch {
      return [];
    }
  },
  { delay: 800 },
);

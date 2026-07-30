// ---------------------------------------------------------------------------
// CodeEditorPane — CodeMirror 6 editor for .qalam source.
// RTL, bidi-isolated, monospace Arabic font, syntax highlighting, live lint.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { EditorView, lineNumbers, highlightActiveLine, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import { useStore } from "../store.js";
import {
  qalamLanguage,
  qalamHighlighting,
  qalamLinter,
  qalamBidiIsolation,
  qalamQualityLinter,
} from "../qalam/index.js";

// ---- Editor theme (matches the app's dark palette) ------------------------

const editorTheme = EditorView.theme(
  {
    "&": {
      direction: "rtl",
      textAlign: "start",
      backgroundColor: "var(--aq-editor-bg)",
      color: "var(--aq-dim)",
      fontSize: "0.9375rem",
      fontFamily:
        '"Cascadia Code", "Fira Code", "Noto Sans Arabic", Consolas, monospace',
      lineHeight: 1.7,
    },
    ".cm-content": {
      direction: "rtl",
      fontFamily: "inherit",
      padding: "0.5rem 0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--aq-input-bg)",
      color: "var(--aq-faint)",
      border: "none",
      fontFamily: "inherit",
      fontSize: "0.8125rem",
      // In RTL, the gutter is on the right (inline-start)
      paddingInlineEnd: "0.25rem",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--aq-bg-deep)",
      color: "var(--aq-muted)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--aq-bg-deep)33",
    },
    ".cm-cursor": {
      borderInlineStart: "2px solid var(--aq-accent)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "var(--aq-border)66",
    },
    ".cm-selectionMatch": {
      backgroundColor: "var(--aq-border)44",
    },
    ".cm-matchingBracket": {
      color: "var(--aq-accent)",
      fontWeight: "bold",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--aq-surface-hi)",
      border: "1px solid var(--aq-border-hi)",
      color: "var(--aq-text)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "0.8125rem",
      direction: "rtl",
    },
    ".cm-diagnostic": {
      // Underline for lint errors
      textDecoration: "underline wavy var(--aq-danger)",
    },
    ".cm-diagnostic.cm-lintRange-info": {
      // Info diagnostics: dotted underline, no wavy (quieter than warnings)
      textDecoration: "underline dotted var(--aq-muted)",
    },
    ".cm-lintRange-info": {
      // No gutter marker for info diagnostics
      backgroundImage: "none",
    },
    ".cm-diagnosticText": {
      // Tooltip for lint messages
      color: "var(--aq-btn-danger-border)",
    },
    "&.cm-focused .cm-cursor": {
      borderInlineStartColor: "var(--aq-accent)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--aq-bg-deep)",
      border: "1px solid var(--aq-border)",
      color: "var(--aq-muted)",
    },
  },
  { dark: true },
);

// ---- Component -------------------------------------------------------------

export default function CodeEditorPane() {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);
  const cursorJump = useStore((s) => s.cursorJump);
  const clearCursorJump = useStore((s) => s.clearCursorJump);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Create the editor once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      doc: source,
      extensions: [
        // Base direction + bidi isolation
        EditorView.contentAttributes.of({ dir: "rtl" }),
        EditorView.perLineTextDirection.of(true),

        // Core editing
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching({ brackets: "{[()]}" }),
        closeBrackets(),

        // Key bindings
        keymap.of([...defaultKeymap, ...historyKeymap]),

        // .qalam language
        qalamLanguage,
        qalamHighlighting,
        qalamLinter,
        qalamQualityLinter,

        // Bidi isolation for operators/symbols
        qalamBidiIsolation(),

        // Theme
        editorTheme,

        // Sync editor → store
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setSource(update.state.doc.toString());
          }
        }),
      ],
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Create only once — source sync is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync store → editor when source changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== source) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: source },
        // Don't create an undo history entry for external changes
        annotations: [],
      });
    }
  }, [source]);

  // Respond to cursor jump requests from the canvas
  useEffect(() => {
    if (!cursorJump) return;
    const view = viewRef.current;
    if (!view) return;

    const doc = view.state.doc.toString();
    const escaped = cursorJump.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headerRe = new RegExp(`^===\\s+${escaped}\\s+===`, "gm");
    const match = headerRe.exec(doc);
    if (match) {
      // Position cursor at the start of the passage content (after the header)
      const pos = match.index + match[0].length;
      view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
      });
      view.focus();
    }
    clearCursorJump();
  }, [cursorJump, clearCursorJump]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minBlockSize: 0,
        overflow: "hidden",
      }}
    />
  );
}

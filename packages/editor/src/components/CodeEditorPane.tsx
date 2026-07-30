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
      backgroundColor: "#141210",
      color: "#c8c0b0",
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
      backgroundColor: "#0e0d0b",
      color: "#4a4540",
      border: "none",
      fontFamily: "inherit",
      fontSize: "0.8125rem",
      // In RTL, the gutter is on the right (inline-start)
      paddingInlineEnd: "0.25rem",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#1a1814",
      color: "#8a8070",
    },
    ".cm-activeLine": {
      backgroundColor: "#1a181433",
    },
    ".cm-cursor": {
      borderInlineStart: "2px solid #d4a843",
    },
    ".cm-selectionBackground": {
      backgroundColor: "#3a352866",
    },
    ".cm-selectionMatch": {
      backgroundColor: "#3a352844",
    },
    ".cm-matchingBracket": {
      color: "#d4a843",
      fontWeight: "bold",
    },
    ".cm-tooltip": {
      backgroundColor: "#2a2620",
      border: "1px solid #4a4030",
      color: "#e0d6c2",
      fontFamily: "system-ui, sans-serif",
      fontSize: "0.8125rem",
      direction: "rtl",
    },
    ".cm-diagnostic": {
      // Underline for lint errors
      textDecoration: "underline wavy #e06060",
    },
    ".cm-diagnosticText": {
      // Tooltip for lint messages
      color: "#e0c0c0",
    },
    "&.cm-focused .cm-cursor": {
      borderInlineStartColor: "#e8c84a",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#1a1814",
      border: "1px solid #3a3528",
      color: "#8a8070",
    },
  },
  { dark: true },
);

// ---- Component -------------------------------------------------------------

export default function CodeEditorPane() {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);

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

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "hidden",
      }}
    />
  );
}

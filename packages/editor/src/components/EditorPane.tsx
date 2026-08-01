// ---------------------------------------------------------------------------
// EditorPane — the قصتك surface. Header with the collapsed AI co-writing
// control and an "افتح مثالًا" button on the same row; below it, whichever
// authoring surface the writer has chosen.
//
// The visual writer is the default and the product. CodeMirror is still here,
// whole, as the advanced mode — one setting away, showing the very source the
// visual writer generates, so nothing is hidden from anybody who wants it.
// ---------------------------------------------------------------------------

import CodeEditorPane from "./CodeEditorPane.js";
import VisualWriterPane from "./VisualWriterPane.js";
import AIActions from "./AIActions.js";
import { newStory, openExample } from "../lib/story-actions.js";
import { useBreakpoint } from "../lib/breakpoint.js";
import { useStore } from "../store.js";

const headerButtonStyle: React.CSSProperties = {
  minBlockSize: "36px",
  paddingBlock: "0.25rem",
  paddingInline: "0.625rem",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
  color: "var(--aq-muted)",
  background: "transparent",
  border: "1px solid var(--aq-border)",
  borderRadius: "6px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function EditorPane() {
  // On a phone these two buttons live in the top bar's ☰ menu instead; the
  // header row has no space for them next to the AI control.
  const isPhone = useBreakpoint() === "phone";
  const writerMode = useStore((s) => s.writerMode);
  const setWriterMode = useStore((s) => s.setWriterMode);

  return (
    <div style={{ blockSize: "100%", display: "flex", flexDirection: "column", minBlockSize: 0 }}>
      {/* Header row: قصتك label + open-example button + collapsed AI button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          // The expanded AI panel wraps onto its own full-width line.
          flexWrap: "wrap",
          rowGap: "0.5rem",
          paddingBlock: "0.5rem",
          paddingInline: "0.75rem",
          borderBlockEnd: "1px solid var(--aq-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "var(--aq-accent)",
            }}
          >
            قصتك
          </span>
          {/* The way back, next to the thing it undoes.
              This was a plain label, and ⚙️ الإعدادات ← وضع المحرر was the only
              route out of the advanced mode — two menus deep, in a panel a
              beginner opens to paste an API key. Anyone who reached code mode
              by accident was stuck there. */}
          {writerMode === "code" && (
            <button
              data-writer-mode="code"
              onClick={() => setWriterMode("visual")}
              title="العودة إلى البطاقات والحقول"
              style={{ ...headerButtonStyle, color: "var(--aq-accent)" }}
            >
              عد إلى المرئي
            </button>
          )}
          {!isPhone && (
            <>
              <button
                onClick={newStory}
                title="مسح النص وبدء قصة جديدة"
                style={headerButtonStyle}
              >
                قصة جديدة
              </button>
              <button
                onClick={openExample}
                title="تحميل قصة طائرة الورق كمثال"
                style={headerButtonStyle}
              >
                افتح مثالًا
              </button>
            </>
          )}
        </div>
        {/* Not a wrapper: `display: contents` makes AIActions' own root the
            flex item, so it can claim a whole row when it expands. Sharing a
            row was the bug — adding one button on the left narrowed the AI
            textarea to 285px in a 637px pane, under the half-pane floor
            `visual.spec.ts` enforces, and it would have narrowed again the
            next time anyone added a word to a button. */}
        <div style={{ display: "contents" }}>
          <AIActions />
        </div>
      </div>

      {/* Authoring surface */}
      <div style={{ flex: 1, minBlockSize: 0 }}>
        {writerMode === "visual" ? <VisualWriterPane /> : <CodeEditorPane />}
      </div>
    </div>
  );
}

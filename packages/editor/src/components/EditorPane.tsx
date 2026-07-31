// ---------------------------------------------------------------------------
// EditorPane — the text-editing surface. Header "قصتك" with collapsed AI
// co-writing control and an "افتح مثالًا" button on the same row.
// CodeMirror below.
// ---------------------------------------------------------------------------

import CodeEditorPane from "./CodeEditorPane.js";
import AIActions from "./AIActions.js";
import { newStory, openExample } from "../lib/story-actions.js";
import { useBreakpoint } from "../lib/breakpoint.js";

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
  // On a phone these two buttons live in the top bar's ⋯ menu instead; the
  // header row has no space for them next to the AI control.
  const isPhone = useBreakpoint() === "phone";

  return (
    <div style={{ blockSize: "100%", display: "flex", flexDirection: "column", minBlockSize: 0 }}>
      {/* Header row: قصتك label + open-example button + collapsed AI button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
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
                title="تحميل قصة العطر المفقود كمثال"
                style={headerButtonStyle}
              >
                افتح مثالًا
              </button>
            </>
          )}
        </div>
        <AIActions />
      </div>

      {/* Code editor */}
      <div style={{ flex: 1, minBlockSize: 0 }}>
        <CodeEditorPane />
      </div>
    </div>
  );
}

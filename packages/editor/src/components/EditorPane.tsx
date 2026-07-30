// ---------------------------------------------------------------------------
// EditorPane — the text-editing surface. Header "قصتك" with collapsed AI
// co-writing control and an "افتح مثالًا" button on the same row.
// CodeMirror below.
// ---------------------------------------------------------------------------

import { useCallback } from "react";
import CodeEditorPane from "./CodeEditorPane.js";
import AIActions from "./AIActions.js";
import { useStore } from "../store.js";
import { SEED_STORY } from "../generated/seed-story.js";

export default function EditorPane() {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);

  const handleOpenExample = useCallback(() => {
    if (source.trim().length > 0) {
      if (!window.confirm("سيؤدي هذا إلى استبدال النص الحالي. هل تريد الاستمرار؟")) return;
    }
    setSource(SEED_STORY);
  }, [source, setSource]);

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
          <button
            onClick={() => {
              if (source.trim().length > 0) {
                if (!window.confirm("سيؤدي هذا إلى مسح النص الحالي. هل تريد الاستمرار؟")) return;
              }
              setSource("");
            }}
            title="مسح النص وبدء قصة جديدة"
            style={{
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
            }}
          >
            قصة جديدة
          </button>
          <button
            onClick={handleOpenExample}
            title="تحميل قصة العطر المفقود كمثال"
            style={{
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
            }}
          >
            افتح مثالًا
          </button>
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

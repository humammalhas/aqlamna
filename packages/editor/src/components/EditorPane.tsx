// ---------------------------------------------------------------------------
// EditorPane — the text-editing surface. Header "قصتك" with collapsed AI
// co-writing control on the same row. CodeMirror below.
// ---------------------------------------------------------------------------

import CodeEditorPane from "./CodeEditorPane.js";
import AIActions from "./AIActions.js";

export default function EditorPane() {
  return (
    <div style={{ blockSize: "100%", display: "flex", flexDirection: "column", minBlockSize: 0 }}>
      {/* Header row: قصتك label + collapsed AI button */}
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
        <span
          style={{
            fontSize: "1rem",
            fontWeight: 700,
            color: "var(--aq-accent)",
          }}
        >
          قصتك
        </span>
        <AIActions />
      </div>

      {/* Code editor */}
      <div style={{ flex: 1, minBlockSize: 0 }}>
        <CodeEditorPane />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditorPane — plain <textarea> for .qalam source editing.
// ---------------------------------------------------------------------------

import { useStore } from "../store.js";

export default function EditorPane() {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <textarea
        className="editor-textarea"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="اكتب قصتك هنا بصيغة .qalam..."
        spellCheck={false}
        style={{ flex: 1 }}
      />
    </div>
  );
}

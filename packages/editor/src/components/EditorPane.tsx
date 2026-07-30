// ---------------------------------------------------------------------------
// EditorPane — wraps the CodeMirror .qalam editor.
// ---------------------------------------------------------------------------

import CodeEditorPane from "./CodeEditorPane.js";

export default function EditorPane() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <CodeEditorPane />
    </div>
  );
}

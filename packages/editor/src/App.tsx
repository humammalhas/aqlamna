// ---------------------------------------------------------------------------
// App — root component. Loads saved source from IndexedDB, seeds fixture 03
// on first run, wires the store to the UI. Supports three view modes:
// text-only, canvas-only, split.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { useStore } from "./store.js";
import { loadSource } from "./lib/db.js";
import TopBar from "./components/TopBar.js";
import EditorPane from "./components/EditorPane.js";
import PlayerPane from "./components/PlayerPane.js";
import CanvasPane from "./components/CanvasPane.js";
import ErrorStrip from "./components/ErrorStrip.js";

const FIXTURE_03 = `عنوان: "الرحيق"

متغير الرحيق = 0
متغير وجد_الخريطة = خطأ
متغير اسم_البطل = "نحلة"

=== البداية ===

{وجد_الخريطة: الخريطة معك.}
جمعتِ {الرحيق} قطرة.

+ [اجمع الرحيق]
  ~ الرحيق = الرحيق + 2
  -> البداية

* [تحدثي مع النحلة الحكيمة]
  ~ وجد_الخريطة = صح
  -> البداية

+ {الرحيق >= 4} [عودي إلى الخلية]
  -> نهاية
`;

export default function App() {
  const storyJson = useStore((s) => s.storyJson);
  const error = useStore((s) => s.error);
  const playerKey = useStore((s) => s.playerKey);
  const viewMode = useStore((s) => s.viewMode);
  const loadSourceAction = useStore((s) => s.loadSource);
  const clearError = useStore((s) => s.clearError);
  const initialized = useRef(false);

  // Load from IndexedDB or seed fixture 03 on first mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    loadSource().then((saved) => {
      if (saved && saved.trim().length > 0) {
        loadSourceAction(saved);
      } else {
        loadSourceAction(FIXTURE_03);
      }
    });
  }, [loadSourceAction]);

  const showText = viewMode === "text" || viewMode === "split";
  const showCanvas = viewMode === "canvas" || viewMode === "split";

  // ---- Main area -----------------------------------------------------------

  const mainArea = (
    <div
      className="flex flex-1"
      style={{ minBlockSize: 0 }}
    >
      {/* Text editor (left/top in split) */}
      {showText && (
        <EditorPane />
      )}

      {/* Divider between text and canvas */}
      {viewMode === "split" && showText && showCanvas && (
        <div
          style={{
            inlineSize: "1px",
            background: "#3a3528",
          }}
        />
      )}

      {/* Canvas (right/bottom in split) */}
      {showCanvas && (
        <CanvasPane />
      )}

      {/* Divider between editor area and player */}
      {showText && (
        <div
          style={{
            inlineSize: "1px",
            background: "#3a3528",
          }}
        />
      )}

      {/* Player pane — only in text and split modes */}
      {showText && (
        <PlayerPane key={playerKey} />
      )}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ blockSize: "100vh" }}>
      {/* Top bar */}
      <TopBar />

      {mainArea}

      {/* Error strip */}
      <ErrorStrip error={error} onDismiss={clearError} />
    </div>
  );
}

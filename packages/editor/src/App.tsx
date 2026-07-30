// ---------------------------------------------------------------------------
// App — root component. Loads saved source from IndexedDB, seeds on first run,
// wires the store to the UI. Three view modes switch the LEFT pane; the player
// is always visible on the right.  "الاثنان" adds a draggable divider.
//
// Pane layout: the editor-main-area is a flex row with min-block-size:0.
// Every pane child gets flex:1 1 0, min-inline-size:0, overflow:auto so
// that panes share space instead of overlapping.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "./store.js";
import { loadSource } from "./lib/db.js";
import TopBar from "./components/TopBar.js";
import EditorPane from "./components/EditorPane.js";
import PlayerPane from "./components/PlayerPane.js";
import CanvasPane from "./components/CanvasPane.js";
import ErrorStrip from "./components/ErrorStrip.js";
import OnboardingOverlay from "./components/OnboardingOverlay.js";

const DIVIDER_KEY = "aqlamna-layout-divider";

function loadDivider(): number {
  try {
    const v = localStorage.getItem(DIVIDER_KEY);
    if (v) {
      const n = parseFloat(v);
      if (n >= 20 && n <= 80) return n;
    }
  } catch { /* noop */ }
  return 50;
}

function saveDivider(pct: number) {
  try { localStorage.setItem(DIVIDER_KEY, String(pct)); } catch { /* noop */ }
}

// Shared pane style — every pane in the flex row uses this.
const PANE_STYLE: React.CSSProperties = {
  flex: "1 1 0",
  minInlineSize: 0,
  blockSize: "100%",
  overflow: "auto",
  position: "relative",
};

export default function App() {
  const storyJson = useStore((s) => s.storyJson);
  const error = useStore((s) => s.error);
  const playerKey = useStore((s) => s.playerKey);
  const viewMode = useStore((s) => s.viewMode);
  const loadSourceAction = useStore((s) => s.loadSource);
  const clearError = useStore((s) => s.clearError);
  const initialized = useRef(false);

  // Divider position: percentage of width for the LEFT pane
  const [leftPct, setLeftPct] = useState(() => loadDivider());
  const [dragging, setDragging] = useState(false);

  const showDivider = viewMode === "split"; // "الاثنان" = draggable divider

  // Load from IndexedDB or seed on first mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    loadSource().then((saved) => {
      if (saved && saved.trim().length > 0) {
        loadSourceAction(saved);
      }
      // First visit: stay empty — no seed story injected.
    });
  }, [loadSourceAction]);

  // ---- Divider drag ----------------------------------------------------------

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const main = document.querySelector(".editor-main-area") as HTMLElement;
      if (!main) return;
      const rect = main.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(20, Math.min(80, pct)));
    };
    const handleUp = () => {
      setDragging(false);
      saveDivider(leftPct);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, leftPct]);

  // Save on divider release
  useEffect(() => {
    if (!dragging) saveDivider(leftPct);
  }, [dragging, leftPct]);

  // ---- What to show in the left pane ----------------------------------------

  const showLeftText = viewMode === "text" || viewMode === "split";
  const showLeftCanvas = viewMode === "canvas";

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  // Left pane — uses PANE_STYLE. In split mode, flex-basis is the divider pct.
  const leftStyle: React.CSSProperties = showDivider
    ? { ...PANE_STYLE, flex: `0 0 ${leftPct}%` }
    : PANE_STYLE;

  const leftPane = (
    <div style={leftStyle}>
      {showLeftText && <EditorPane />}
      {showLeftCanvas && <CanvasPane />}
    </div>
  );

  // Player pane wrapper — uses PANE_STYLE
  const playerWrapperStyle: React.CSSProperties = showDivider
    ? { ...PANE_STYLE }
    : PANE_STYLE;

  const mainArea = (
    <div
      className="editor-main-area"
      style={{
        display: "flex",
        flex: "1 1 0",
        minBlockSize: 0,
        overflow: "hidden",
        flexDirection: isMobile ? "column" : "row",
      }}
    >
      {leftPane}

      {/* Draggable divider — only in الاثنان mode */}
      {!isMobile && showDivider && (
        <div
          onMouseDown={handleDividerMouseDown}
          className="editor-divider"
          style={{
            inlineSize: "4px",
            cursor: "col-resize",
            background: dragging ? "var(--aq-accent)" : "var(--aq-border)",
            flexShrink: 0,
            transition: dragging ? "none" : "background 0.15s",
          }}
        />
      )}

      {/* Player pane — always visible */}
      {!isMobile && (
        <div style={playerWrapperStyle}>
          <PlayerPane key={playerKey} />
        </div>
      )}

      {/* On mobile: player shown below when story is compiled */}
      {isMobile && storyJson && (
        <div style={{ flex: "0 0 45%", minBlockSize: 0 }}>
          <PlayerPane key={playerKey} />
        </div>
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

      {/* Onboarding overlay — first visit only */}
      <OnboardingOverlay />
    </div>
  );
}

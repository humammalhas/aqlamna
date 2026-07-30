// ---------------------------------------------------------------------------
// App — root component. Three independent toggleable panes in a CSS grid.
// Player on the right, text and canvas on the left. Drag handles between
// adjacent visible panes. No overlays, no absolute positioning.
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

// ---- Pane widths persisted in localStorage ----

const WIDTHS_KEY = "aqlamna-pane-widths";
const MIN_PX = 260;

function loadWidths(): number[] {
  try {
    const v = localStorage.getItem(WIDTHS_KEY);
    if (v) return JSON.parse(v) as number[];
  } catch { /* noop */ }
  return [];
}
function saveWidths(w: number[]) {
  try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(w)); } catch { /* noop */ }
}

// ---- Drag state ----

type DragTarget = { leftIdx: number; rightIdx: number; startX: number; startLeft: number; startRight: number };

export default function App() {
  const storyJson = useStore((s) => s.storyJson);
  const error = useStore((s) => s.error);
  const playerKey = useStore((s) => s.playerKey);
  const panePlayer = useStore((s) => s.panePlayer);
  const paneText = useStore((s) => s.paneText);
  const paneCanvas = useStore((s) => s.paneCanvas);
  const loadSourceAction = useStore((s) => s.loadSource);
  const clearError = useStore((s) => s.clearError);
  const initialized = useRef(false);

  // Pane widths as fractions (sum = 1 when all visible). Stored as pixel ratios.
  const [widths, setWidths] = useState<number[]>(() => loadWidths());
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build the ordered list of visible panes. Order: player, text, canvas.
  // But we show them as: [text] [canvas] [player] — left to right.
  // Actually, user wants: player on the right. So order in DOM: text, canvas, player.
  // The grid columns are: text? canvas? player? (with dividers between).

  // In RTL, the first grid column appears on the RIGHT.
  // We want: player (right), canvas, text (left).
  const visible: Array<{ key: string; label: string }> = [];
  if (panePlayer) visible.push({ key: "player", label: "شغّل" });
  if (paneCanvas) visible.push({ key: "canvas", label: "مخطط" });
  if (paneText) visible.push({ key: "text", label: "نص" });

  // Always at least one pane visible
  const effectiveVisible = visible.length === 0
    ? [{ key: "text", label: "نص" }]
    : visible;

  // Compute grid-template-columns from widths + dividers
  const gridCols = effectiveVisible.flatMap((_, i) => {
    const cols: string[] = [];
    if (i > 0) cols.push("4px"); // divider
    const w = widths[i] ?? (1 / effectiveVisible.length);
    cols.push(`${w}fr`);
    return cols;
  }).join(" ");

  // Load source on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadSource().then((saved) => {
      if (saved && saved.trim().length > 0) loadSourceAction(saved);
    });
  }, [loadSourceAction]);

  // Save widths on change
  useEffect(() => { saveWidths(widths); }, [widths]);

  // ---- Drag handlers ----

  const handleDividerDown = useCallback((leftIdx: number, rightIdx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDrag({
      leftIdx,
      rightIdx,
      startX: e.clientX,
      startLeft: widths[leftIdx] ?? 0.5,
      startRight: widths[rightIdx] ?? 0.5,
    });
  }, [widths]);

  useEffect(() => {
    if (!drag || !containerRef.current) return;

    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const totalPx = rect.width;
      const dx = e.clientX - drag.startX;
      const dFrac = dx / totalPx;

      const newLeft = Math.max(MIN_PX / totalPx, drag.startLeft + dFrac);
      const newRight = Math.max(MIN_PX / totalPx, drag.startRight - dFrac);

      // Don't let either go below min
      if (newLeft < MIN_PX / totalPx || newRight < MIN_PX / totalPx) return;

      setWidths((prev) => {
        const next = [...prev];
        next[drag.leftIdx] = newLeft;
        next[drag.rightIdx] = newRight;
        return next;
      });
    };

    const handleUp = () => setDrag(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [drag]);

  // ---- Render ----

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;

  const renderPane = (key: string) => {
    switch (key) {
      case "text": return <EditorPane />;
      case "canvas": return <CanvasPane />;
      case "player": return <PlayerPane key={playerKey} />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col" style={{ blockSize: "100vh" }}>
      <TopBar />

      {!isMobile && (
        <div
          ref={containerRef}
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            flex: "1 1 0",
            minBlockSize: 0,
            overflow: "hidden",
          }}
        >
          {effectiveVisible.map((pane, i) => (
            <div key={pane.key} style={{ minBlockSize: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Divider before this pane */}
              {i > 0 && (
                <div
                  onMouseDown={handleDividerDown(i - 1, i)}
                  style={{
                    gridColumn: `${i * 2}`,
                    gridRow: 1,
                    inlineSize: "4px",
                    cursor: "col-resize",
                    background: drag && drag.leftIdx === i - 1 ? "var(--aq-accent)" : "var(--aq-border)",
                    zIndex: 10,
                    flexShrink: 0,
                  }}
                />
              )}
              {/* Pane content */}
              <div style={{ flex: "1 1 0", minBlockSize: 0, overflow: "auto", position: "relative" }}>
                {renderPane(pane.key)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile: stacked */}
      {isMobile && (
        <div style={{ flex: "1 1 0", minBlockSize: 0, display: "flex", flexDirection: "column", overflow: "auto" }}>
          {paneText && (
            <div style={{ flex: panePlayer && storyJson ? "0 0 55%" : "1 1 0", minBlockSize: 0, overflow: "hidden" }}>
              <EditorPane />
            </div>
          )}
          {paneCanvas && (
            <div style={{ flex: "0 0 40%", minBlockSize: 0 }}>
              <CanvasPane />
            </div>
          )}
          {panePlayer && storyJson && (
            <div style={{ flex: "0 0 45%", minBlockSize: 0 }}>
              <PlayerPane key={playerKey} />
            </div>
          )}
        </div>
      )}

      <ErrorStrip error={error} onDismiss={clearError} />
      <OnboardingOverlay />
    </div>
  );
}

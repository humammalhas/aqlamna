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

type WidthsMap = Record<string, number>;

function loadWidths(): WidthsMap {
  try {
    const v = localStorage.getItem(WIDTHS_KEY);
    if (v) return JSON.parse(v) as WidthsMap;
  } catch { /* noop */ }
  return {};
}
function saveWidths(w: WidthsMap) {
  try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(w)); } catch { /* noop */ }
}

/** Return equal widths for the given keys, normalized to sum=1. */
function equalWidths(keys: string[]): WidthsMap {
  const n = keys.length;
  const w: WidthsMap = {};
  for (const k of keys) w[k] = 1 / n;
  return w;
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

  // Pane widths keyed by pane type (e.g. "text", "canvas", "player").
  const [widths, setWidths] = useState<WidthsMap>(() => loadWidths());
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // In RTL, the first grid column appears on the RIGHT.
  // We want: player (right), canvas, text (left).
  const visible: Array<{ key: string; label: string }> = [];
  if (panePlayer) visible.push({ key: "player", label: "شغّل" });
  if (paneCanvas) visible.push({ key: "canvas", label: "مخطط" });
  if (paneText) visible.push({ key: "text", label: "نص" });

  const effectiveVisible = visible.length === 0
    ? [{ key: "text", label: "نص" }]
    : visible;

  // Normalise widths: use saved values for visible panes, fill gaps with equal share
  const visibleKeys = effectiveVisible.map((p) => p.key);
  const normWidths = (() => {
    const total = visibleKeys.reduce((s, k) => s + (widths[k] || 0), 0);
    if (total > 0.01) {
      // We have saved widths — renormalise to sum=1
      const out: WidthsMap = {};
      for (const k of visibleKeys) out[k] = (widths[k] || 0) / total;
      return out;
    }
    return equalWidths(visibleKeys);
  })();

  // Compute grid-template-columns: each pane gets its share, dividers between
  const gridCols = visibleKeys.flatMap((k, i) => {
    const cols: string[] = [];
    if (i > 0) cols.push("4px");
    cols.push(`${normWidths[k]}fr`);
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

  const handleDividerDown = useCallback((leftKey: string, rightKey: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDrag({
      leftIdx: 0, rightIdx: 0, // unused with key-based widths
      startX: e.clientX,
      startLeft: normWidths[leftKey] ?? 0.5,
      startRight: normWidths[rightKey] ?? 0.5,
      leftKey,
      rightKey,
    } as DragTarget & { leftKey: string; rightKey: string });
  }, [normWidths]);

  useEffect(() => {
    if (!drag || !containerRef.current) return;
    const d = drag as DragTarget & { leftKey?: string; rightKey?: string };
    if (!d.leftKey || !d.rightKey) return;

    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const totalPx = rect.width;
      const dx = e.clientX - drag.startX;
      const dFrac = dx / totalPx;

      const newLeft = Math.max(MIN_PX / totalPx, drag.startLeft + dFrac);
      const newRight = Math.max(MIN_PX / totalPx, drag.startRight - dFrac);

      setWidths((prev) => {
        const next = { ...prev };
        next[d.leftKey!] = newLeft;
        next[d.rightKey!] = newRight;
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
          {effectiveVisible.flatMap((pane, i) => {
            const items = [];
            // Divider before this pane (except first)
            if (i > 0) {
              items.push(
                <div
                  key={`div-${visibleKeys[i - 1]}-${visibleKeys[i]}`}
                  onMouseDown={handleDividerDown(visibleKeys[i - 1], visibleKeys[i])}
                  style={{
                    gridColumn: i * 2, // 2, 4, 6, ...
                    gridRow: 1,
                    inlineSize: "6px",
                    cursor: "col-resize",
                    background: drag ? "var(--aq-accent)" : "var(--aq-border)",
                    zIndex: 10,
                  }}
                />
              );
            }
            // Pane
            items.push(
              <div
                key={pane.key}
                style={{
                  gridColumn: i * 2 + 1, // 1, 3, 5, ...
                  gridRow: 1,
                  minBlockSize: 0,
                  overflow: "auto",
                  position: "relative",
                }}
              >
                {renderPane(pane.key)}
              </div>
            );
            return items;
          })}
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

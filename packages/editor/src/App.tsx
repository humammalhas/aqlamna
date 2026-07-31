// ---------------------------------------------------------------------------
// App — root component.
//
//   desktop (>= 64rem)  three panes in a CSS grid with draggable dividers
//   tablet  (40–64rem)  two panes, one divider; a third selection replaces one
//   phone   (< 40rem)   ONE pane, full width and height, with a bottom tab bar
//
// No overlays, no absolute positioning, no horizontal page scroll at any size.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore, type PaneKey } from "./store.js";
import { loadSource } from "./lib/db.js";
import { useBreakpoint, MAX_PANES } from "./lib/breakpoint.js";
import TopBar from "./components/TopBar.js";
import EditorPane from "./components/EditorPane.js";
import PlayerPane from "./components/PlayerPane.js";
import CanvasPane from "./components/CanvasPane.js";
import ErrorStrip from "./components/ErrorStrip.js";
import InstallPrompt from "./components/InstallPrompt.js";
import OnboardingOverlay from "./components/OnboardingOverlay.js";

// ---- Pane widths persisted in localStorage ----

const WIDTHS_KEY = "aqlamna-pane-widths";
const MIN_PX = 260;
const DIVIDER_PX = 6;

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

/** Panes in RTL visual order: the first entry is painted RIGHTMOST. */
const PANE_ORDER: Array<{ key: PaneKey; label: string; tabLabel: string }> = [
  { key: "player", label: "شغّل", tabLabel: "▶ شغّل" },
  { key: "canvas", label: "مخطط", tabLabel: "مخطط" },
  { key: "text", label: "نص", tabLabel: "قصتك" },
];

type DragTarget = {
  startKey: PaneKey;
  endKey: PaneKey;
  startX: number;
  startStart: number;
  startEnd: number;
};

export default function App() {
  const error = useStore((s) => s.error);
  const playerKey = useStore((s) => s.playerKey);
  const panePlayer = useStore((s) => s.panePlayer);
  const paneText = useStore((s) => s.paneText);
  const paneCanvas = useStore((s) => s.paneCanvas);
  const togglePane = useStore((s) => s.togglePane);
  const ensurePaneLimit = useStore((s) => s.ensurePaneLimit);
  const loadSourceAction = useStore((s) => s.loadSource);
  const clearError = useStore((s) => s.clearError);
  const compileSource = useStore((s) => s.compileSource);
  const initialized = useRef(false);

  const breakpoint = useBreakpoint();
  const maxPanes = MAX_PANES[breakpoint];

  const [widths, setWidths] = useState<WidthsMap>(() => loadWidths());
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const on: Record<PaneKey, boolean> = {
    player: panePlayer,
    text: paneText,
    canvas: paneCanvas,
  };
  // The store guarantees at least one and at most `maxPanes` are on, so this
  // list is never empty and never needs a fallback that the toggles disagree
  // with. Trim defensively anyway if a stale localStorage says otherwise.
  const visible = PANE_ORDER.filter((p) => on[p.key]).slice(0, maxPanes);
  const visibleKeys = visible.map((p) => p.key);

  // Enforce the size limit when the window crosses a breakpoint, so the
  // toggles and the tab bar always agree with what is on screen.
  useEffect(() => {
    ensurePaneLimit(maxPanes);
  }, [maxPanes, panePlayer, paneText, paneCanvas, ensurePaneLimit]);

  // Normalise widths. A pane with no saved width must get a real share — the
  // old code divided 0 by the running total and handed the newly enabled pane
  // a column of exactly 0px.
  const normWidths = (() => {
    const known = visibleKeys.filter((k) => (widths[k] ?? 0) > 0);
    if (known.length === 0) {
      const out: WidthsMap = {};
      for (const k of visibleKeys) out[k] = 1 / visibleKeys.length;
      return out;
    }
    const avg = known.reduce((s, k) => s + widths[k]!, 0) / known.length;
    const filled: WidthsMap = {};
    for (const k of visibleKeys) filled[k] = (widths[k] ?? 0) > 0 ? widths[k]! : avg;
    const total = visibleKeys.reduce((s, k) => s + filled[k]!, 0);
    const out: WidthsMap = {};
    for (const k of visibleKeys) out[k] = filled[k]! / total;
    return out;
  })();

  // Dividers are declared at the same px width as the element that fills them,
  // so the columns add up to the container and not four pixels more.
  const gridCols = visibleKeys
    .flatMap((k, i) => (i > 0 ? [`${DIVIDER_PX}px`, `${normWidths[k]}fr`] : [`${normWidths[k]}fr`]))
    .join(" ");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadSource().then((saved) => {
      if (saved && saved.trim().length > 0) loadSourceAction(saved);
    });
  }, [loadSourceAction]);

  useEffect(() => { saveWidths(widths); }, [widths]);

  // ---- Divider drag --------------------------------------------------------

  const handleDividerDown = useCallback(
    (startKey: PaneKey, endKey: PaneKey) => (e: React.MouseEvent) => {
      e.preventDefault();
      setDrag({
        startKey,
        endKey,
        startX: e.clientX,
        startStart: normWidths[startKey] ?? 0.5,
        startEnd: normWidths[endKey] ?? 0.5,
      });
    },
    [normWidths],
  );

  useEffect(() => {
    if (!drag || !containerRef.current) return;

    const handleMove = (e: MouseEvent) => {
      const totalPx = containerRef.current!.getBoundingClientRect().width;
      if (totalPx <= 0) return;

      // The grid is RTL: `startKey` is the pane on the RIGHT of the divider.
      // Dragging the cursor right must therefore SHRINK it, or the divider
      // travels the opposite way to the mouse — measured at exactly -1:1.
      const dFrac = -(e.clientX - drag.startX) / totalPx;

      const minFrac = MIN_PX / totalPx;
      const pair = drag.startStart + drag.startEnd;
      let next = drag.startStart + dFrac;
      next = Math.max(minFrac, Math.min(pair - minFrac, next));
      // A container too narrow for two minimums: split it and stop.
      if (pair - minFrac < minFrac) next = pair / 2;

      setWidths((prev) => ({
        ...prev,
        [drag.startKey]: next,
        [drag.endKey]: pair - next,
      }));
    };

    const handleUp = () => setDrag(null);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [drag]);

  // ---- Render --------------------------------------------------------------

  const renderPane = (key: PaneKey) => {
    switch (key) {
      case "text": return <EditorPane />;
      case "canvas": return <CanvasPane />;
      case "player": return <PlayerPane key={playerKey} />;
      default: return null;
    }
  };

  const isPhone = breakpoint === "phone";

  return (
    <div className="flex flex-col" style={{ blockSize: "100dvh", overflowX: "hidden" }}>
      <h1 className="sr-only">أقلامنا — محرّر القصص التفاعلية</h1>

      <TopBar breakpoint={breakpoint} maxPanes={maxPanes} />

      {isPhone ? (
        // One pane, full width, full height. Everything else is a tab away.
        <div
          data-panes="phone"
          style={{ flex: "1 1 0", minBlockSize: 0, overflow: "hidden" }}
        >
          {visibleKeys.map((key) => (
            <div
              key={key}
              data-pane={key}
              style={{
                blockSize: "100%",
                minBlockSize: 0,
                overflow: "auto",
                position: "relative",
              }}
            >
              {renderPane(key)}
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={containerRef}
          data-panes={breakpoint}
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            flex: "1 1 0",
            minBlockSize: 0,
            overflow: "hidden",
          }}
        >
          {visible.flatMap((pane, i) => {
            const items = [];
            if (i > 0) {
              items.push(
                <div
                  key={`div-${visibleKeys[i - 1]}-${visibleKeys[i]}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`غيّر عرض ${visible[i - 1]!.label} و${pane.label}`}
                  tabIndex={0}
                  onMouseDown={handleDividerDown(visibleKeys[i - 1]!, visibleKeys[i]!)}
                  style={{
                    gridColumn: i * 2,
                    gridRow: 1,
                    inlineSize: "100%",
                    cursor: "col-resize",
                    background: drag ? "var(--aq-accent)" : "var(--aq-border)",
                    zIndex: 10,
                  }}
                />,
              );
            }
            items.push(
              <div
                key={pane.key}
                data-pane={pane.key}
                style={{
                  gridColumn: i * 2 + 1,
                  gridRow: 1,
                  minInlineSize: 0,
                  minBlockSize: 0,
                  overflow: "auto",
                  position: "relative",
                }}
              >
                {renderPane(pane.key)}
              </div>,
            );
            return items;
          })}
        </div>
      )}

      {/* Above the tab bar, below the panes: a bar the writer can ignore. */}
      <InstallPrompt />

      {isPhone && (
        // Bottom, not top — that is where thumbs are.
        <nav
          aria-label="الأقسام"
          style={{
            display: "flex",
            flexShrink: 0,
            borderBlockStart: "1px solid var(--aq-border)",
            background: "var(--aq-surface)",
            paddingBlockEnd: "env(safe-area-inset-bottom)",
          }}
        >
          {PANE_ORDER.slice().reverse().map((p) => {
            const active = visibleKeys[0] === p.key;
            return (
              <button
                key={p.key}
                data-pane-tab={p.key}
                aria-pressed={active}
                onClick={() => {
                  // ▶ شغّل is the only run action on a phone — the yellow
                  // button lives in the desktop top bar, which has no room
                  // here. Without this the tab only switched to the player
                  // pane, nothing ever compiled, and the pane sat on its
                  // "press ▶ شغّل" empty state forever: you could write on a
                  // phone and never run what you wrote. Tapping it again
                  // re-runs, which is what a run button should do.
                  if (p.key === "player") compileSource();
                  togglePane(p.key, 1);
                }}
                style={{
                  flex: "1 1 0",
                  minBlockSize: "48px",
                  paddingBlock: "0.5rem",
                  fontSize: "0.9375rem",
                  fontWeight: active ? 700 : 400,
                  fontFamily: "inherit",
                  color: active ? "var(--aq-accent)" : "var(--aq-muted)",
                  background: "transparent",
                  border: "none",
                  borderBlockStart: active
                    ? "2px solid var(--aq-accent)"
                    : "2px solid transparent",
                  cursor: "pointer",
                }}
              >
                {p.tabLabel}
              </button>
            );
          })}
        </nav>
      )}

      <ErrorStrip error={error} onDismiss={clearError} />
      <OnboardingOverlay />
    </div>
  );
}

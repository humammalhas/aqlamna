// ---------------------------------------------------------------------------
// TopBar.
//
//   desktop / tablet  title, pane toggles, ❓, ⚙️ الإعدادات, ▶ شغّل, ⬇ تصدير
//   phone             أقلامنا, ⚙️ الإعدادات and a ☰ overflow menu
//
// At 390px the old bar had scrollWidth 592 in clientWidth 390 while the page
// itself did not scroll, so ⬇ تصدير and ▶ شغّل sat at NEGATIVE x — rendered,
// focusable, and impossible to reach. Nothing here may overflow the viewport.
// ---------------------------------------------------------------------------

import { useStore, type PaneKey } from "../store.js";
import { exportStoryForDownload, downloadHtml } from "../lib/export-html.js";
import { newStory, openExample } from "../lib/story-actions.js";
import type { Breakpoint } from "../lib/breakpoint.js";
import SettingsPanel from "./SettingsPanel.js";
import { useState, useCallback, useEffect, useRef } from "react";

const DOCS = [
  { href: "/docs/البداية.html", label: "📖 البداية — الدليل التعليمي" },
  { href: "/docs/المرجع.html", label: "📚 المرجع — دليل اللغة" },
  { href: "/docs/الأخطاء.html", label: "⚠️ الأخطاء — رموز الخطأ" },
];

const HelpLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    style={{ display: "block", paddingBlock: "0.75rem", paddingInline: "1rem",
      minBlockSize: "44px", fontSize: "0.875rem",
      color: "var(--aq-text)", textDecoration: "none", whiteSpace: "nowrap" }}>
    {children}
  </a>
);

const menuItemStyle: React.CSSProperties = {
  display: "block",
  inlineSize: "100%",
  minBlockSize: "44px",
  paddingBlock: "0.75rem",
  paddingInline: "1rem",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  textAlign: "start",
  color: "var(--aq-text)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const iconButtonStyle: React.CSSProperties = {
  minBlockSize: "44px",
  minInlineSize: "44px",
  paddingBlock: "0.5rem",
  paddingInline: "0.75rem",
  fontSize: "0.9375rem",
  fontFamily: "inherit",
  color: "var(--aq-muted)",
  background: "var(--aq-surface-hi)",
  border: "1px solid var(--aq-border)",
  borderRadius: "6px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

interface Props {
  breakpoint: Breakpoint;
  maxPanes: number;
}

export default function TopBar({ breakpoint, maxPanes }: Props) {
  const storyJson = useStore((s) => s.storyJson);
  const compileSource = useStore((s) => s.compileSource);
  const panePlayer = useStore((s) => s.panePlayer);
  const paneText = useStore((s) => s.paneText);
  const paneCanvas = useStore((s) => s.paneCanvas);
  const togglePane = useStore((s) => s.togglePane);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isPhone = breakpoint === "phone";

  const toggleSettings = useCallback(() => setSettingsOpen((v) => !v), []);
  const handlePlay = useCallback(() => compileSource(), [compileSource]);

  /**
   * Phone: compile AND bring the player forward. On a phone only one pane is
   * on screen, so compiling while the text pane is showing would look like
   * nothing happened at all.
   */
  const handlePhoneRun = useCallback(() => {
    compileSource();
    togglePane("player", 1);
  }, [compileSource, togglePane]);

  const handleExport = useCallback(async () => {
    let json = storyJson;
    if (!json) {
      compileSource();
      json = useStore.getState().storyJson;
    }
    if (!json) return; // compilation failed

    const result = await exportStoryForDownload(json, "default");
    if (result.blocked) {
      alert(result.blockedMessage);
      return;
    }
    if (!result.html) return;

    const baseName = (json.title ?? "قصة").replace(/[<>:"/\\|?*]/g, "_");
    downloadHtml(result.html, `${baseName}.html`);
  }, [storyJson, compileSource]);

  // Close the overflow menu on outside click or Escape — a menu you cannot
  // dismiss on a phone covers the only pane you have.
  useEffect(() => {
    if (!showMore && !showHelp) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
        setShowHelp(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowMore(false); setShowHelp(false); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showMore, showHelp]);

  const paneToggles: Array<{ key: PaneKey; label: string; on: boolean }> = [
    { key: "player", label: "شغّل", on: panePlayer },
    { key: "text", label: "نص", on: paneText },
    { key: "canvas", label: "مخطط", on: paneCanvas },
  ];

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          flexWrap: "nowrap",
          inlineSize: "100%",
          maxInlineSize: "100%",
          // NOT `overflow: hidden`. It was here to stop the bar overflowing
          // sideways at 390px, but it also clipped every dropdown to the
          // header's 61px height: the ☰ menu opened 281px tall and only its
          // top 5px was ever painted, so the button looked dead — on the
          // phone AND on desktop, where it took the docs links with it.
          // Horizontal containment comes from the flex layout below plus
          // `overflow-x: hidden` on html/body; the responsive suite asserts
          // no interactive element ever leaves the viewport.
          overflow: "visible",
          paddingBlock: "0.5rem",
          paddingInline: isPhone ? "0.75rem" : "1rem",
          background: "var(--aq-surface)",
          borderBlockEnd: "1px solid var(--aq-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minInlineSize: 0 }}>
          <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--aq-accent)" }}>
            أقلامنا
          </span>
          {!isPhone && (
            <span style={{ fontSize: "0.9375rem", color: "var(--aq-muted)" }}>المحرر</span>
          )}
        </div>

        {/* Pane toggles live in the bottom tab bar on a phone. */}
        {!isPhone && (
          <div style={{ display: "flex", gap: "0.375rem" }} role="group" aria-label="الأقسام">
            {paneToggles.map((t) => (
              <button
                key={t.key}
                onClick={() => togglePane(t.key, maxPanes)}
                aria-pressed={t.on}
                style={{
                  minBlockSize: "36px",
                  paddingBlock: "0.375rem",
                  paddingInline: "0.75rem",
                  fontSize: "0.8125rem",
                  fontWeight: t.on ? 700 : 400,
                  fontFamily: "inherit",
                  color: t.on ? "var(--aq-editor-bg)" : "var(--aq-muted)",
                  background: t.on ? "var(--aq-accent)" : "var(--aq-surface-hi)",
                  border: t.on ? "none" : "1px solid var(--aq-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!isPhone && (
            <div style={{ position: "relative" }} ref={moreRef}>
              <button
                onClick={() => setShowHelp((v) => !v)}
                title="مساعدة"
                aria-label="مساعدة"
                aria-expanded={showHelp}
                style={iconButtonStyle}
              >
                ❓
              </button>
              {showHelp && (
                <div style={dropdownStyle}>
                  {DOCS.map((d) => (
                    <HelpLink key={d.href} href={d.href}>{d.label}</HelpLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Portrait phone: settings AND run, both always visible. Run used
              to exist only as a bottom TAB, and a tab does not read as an
              action — the report was simply "i cant see run". Rotating the
              phone past 640px brought the real button back, which is the
              mental model to match here. Measured at 390px the bar does not
              overflow with both. */}
          {isPhone && (
            <button
              onClick={toggleSettings}
              title="الإعدادات"
              aria-label="الإعدادات"
              style={iconButtonStyle}
            >
              ⚙️
            </button>
          )}

          {isPhone && (
            <button
              onClick={handlePhoneRun}
              data-run-button
              style={{
                minBlockSize: "44px",
                paddingBlock: "0.5rem",
                paddingInline: "1rem",
                fontSize: "0.9375rem",
                fontWeight: 700,
                fontFamily: "inherit",
                color: "var(--aq-editor-bg)",
                background: "var(--aq-accent)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ▶ شغّل
            </button>
          )}

          {!isPhone && (
            <button
              onClick={toggleSettings}
              title="الإعدادات"
              aria-label="الإعدادات"
              style={iconButtonStyle}
            >
              ⚙️ الإعدادات
            </button>
          )}

          {!isPhone && (
            <>
              <button
                onClick={handlePlay}
                style={{
                  minBlockSize: "44px",
                  paddingBlock: "0.5rem",
                  paddingInline: "1.25rem",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  color: "var(--aq-editor-bg)",
                  background: "var(--aq-accent)",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ▶ شغّل
              </button>

              <button
                onClick={handleExport}
                style={{
                  minBlockSize: "44px",
                  paddingBlock: "0.5rem",
                  paddingInline: "1.25rem",
                  fontSize: "0.9375rem",
                  fontFamily: "inherit",
                  color: "var(--aq-text)",
                  background: "var(--aq-surface-hi)",
                  border: "1px solid var(--aq-border-hi)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ⬇ تصدير
              </button>
            </>
          )}

          {isPhone && (
            <div style={{ position: "relative" }} ref={moreRef}>
              <button
                onClick={() => setShowMore((v) => !v)}
                title="القائمة"
                aria-label="القائمة"
                aria-expanded={showMore}
                aria-haspopup="menu"
                style={iconButtonStyle}
              >
                ☰
              </button>
              {showMore && (
                <div role="menu" style={dropdownStyle}>
                  {/* الإعدادات is NOT duplicated here — it has its own ⚙️
                      button in the bar, next to ▶ شغّل. */}
                  <button
                    role="menuitem"
                    style={menuItemStyle}
                    onClick={() => { setShowMore(false); void handleExport(); }}
                  >
                    ⬇ تصدير
                  </button>
                  <button
                    role="menuitem"
                    style={menuItemStyle}
                    onClick={() => { setShowMore(false); newStory(); }}
                  >
                    قصة جديدة
                  </button>
                  <button
                    role="menuitem"
                    style={menuItemStyle}
                    onClick={() => { setShowMore(false); openExample(); }}
                  >
                    افتح مثالًا
                  </button>
                  <hr style={{ border: 0, borderBlockStart: "1px solid var(--aq-border)", margin: 0 }} />
                  {DOCS.map((d) => (
                    <HelpLink key={d.href} href={d.href}>{d.label}</HelpLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  insetBlockStart: "100%",
  insetInlineEnd: 0,
  marginBlockStart: "0.25rem",
  background: "var(--aq-surface)",
  border: "1px solid var(--aq-border)",
  borderRadius: "6px",
  paddingBlock: "0.25rem",
  zIndex: 100,
  minInlineSize: "200px",
  maxInlineSize: "min(20rem, calc(100vw - 1.5rem))",
};

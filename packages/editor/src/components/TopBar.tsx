// ---------------------------------------------------------------------------
// TopBar.
//
//   desktop / tablet  title, pane toggles, ❓, ⚙️ الإعدادات, ▶ شغّل, ⬇ تصدير
//   phone             أقلامنا, ⚙️, ▶ شغّل, ⬇ تصدير and a ☰ overflow menu
//
// At 390px the old bar had scrollWidth 592 in clientWidth 390 while the page
// itself did not scroll, so ⬇ تصدير and ▶ شغّل sat at NEGATIVE x — rendered,
// focusable, and impossible to reach. Nothing here may overflow the viewport.
//
// ACCESSIBLE NAMES. The pane toggle for the player is labelled "شغّل" and the
// run action reads "▶ شغّل", so `getByRole("button", {name: /شغّل/})` matched
// both and every Playwright click on it died on strict mode. The two controls
// do different things and must be nameable apart, so the ACTIONS carry an
// explicit aria-label — "شغّل القصة" and "تصدير القصة" — while the toggles keep
// their bare pane names. Both labels contain the visible text (WCAG 2.5.3).
// The data-* hooks stay for geometry probes that do not care about roles.
// ---------------------------------------------------------------------------

import { useStore, type PaneKey } from "../store.js";
import { exportStoryForDownload, downloadHtml } from "../lib/export-html.js";
import { newStory, openExample } from "../lib/story-actions.js";
import type { Breakpoint } from "../lib/breakpoint.js";
import SettingsPanel from "./SettingsPanel.js";
import { useState, useCallback, useEffect, useRef } from "react";

/**
 * The ❓ menu, for somebody who has not chosen to see code.
 *
 * It listed three links and two of them were language references — `المرجع`
 * (every keyword and operator) and `الأخطاء` (E101…E203). A beginner opening
 * help in a form-based editor met a syntax manual two entries down. Both still
 * exist and both are still linked: from `البداية`'s own الوضع المتقدّم section,
 * and from the advanced-mode row in ⚙️ الإعدادات — beside the switch that turns
 * the language on, which is the only place they answer a question anyone has.
 */
const DOCS = [
  { href: "/docs/البداية.html", label: "📖 البداية — الدليل التعليمي" },
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

  // Same three words as App.tsx's PANE_ORDER and as the landing page's preview
  // tabs. The text pane is `قصتك` here and `قصتك` in EditorPane's header; it
  // used to be `نص` in one and `قصتك` in the other, in the same window.
  const paneToggles: Array<{ key: PaneKey; label: string; on: boolean }> = [
    { key: "player", label: "شغّل", on: panePlayer },
    { key: "text", label: "قصتك", on: paneText },
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
          {/* THE WAY OUT. This was a <span>, and the editor had zero <a> in its
              header and zero links to "/" anywhere on the page — so once you
              opened /editor/ the only exits were browser back and retyping the
              URL. An INSTALLED user has neither: the manifest sets
              start_url "/editor/" with display "standalone", so the app opens
              straight into the editor with no address bar, and the landing
              page, the docs, privacy and terms were unreachable by any means.

              A real <a href="/">, not onClick on a span: middle-click,
              ⌘/Ctrl-click, "open in new tab" and the keyboard all have to
              work, and only an anchor gives them for free. No target="_blank"
              — inside the installed app that would throw the visitor out into
              a browser window; "/" is inside the manifest's scope ("/"), so a
              plain same-origin href navigates within the app.

              The accessible name says the DESTINATION, because "أقلامنا" alone
              is a brand name and tells a screen-reader user nothing about
              where the link goes. It opens with the visible text, so it
              satisfies WCAG 2.5.3 (label in name); `الصفحة الرئيسية` is the
              same wording the docs footers already use for this destination.

              GEOMETRY. `inline-flex` + `min-block-size` gives the link a 44px
              tall target WITHOUT adding a single pixel of inline width — the
              phone bar at 390px has to hold this plus ⚙️, ▶ شغّل, ⬇ تصدير and
              ☰ with scrollWidth === clientWidth, and the header is already
              61px tall because of those 44px buttons. Any horizontal padding
              here spends width the bar does not have. `textDecoration: none`
              is not cosmetic: an anchor underlines by default and the span did
              not. */}
          <a
            href="/"
            data-home-link
            title="الصفحة الرئيسية"
            aria-label="أقلامنا — الصفحة الرئيسية"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minBlockSize: "44px",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--aq-accent)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            أقلامنا
          </a>
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
              aria-label="شغّل القصة"
              style={{
                minBlockSize: "44px",
                paddingBlock: "0.5rem",
                paddingInline: "0.625rem",
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

          {/* ⬇ تصدير on a phone is an ADDITION, not a move: it is still in the
              ☰ menu below. Export is the one action that produces the thing
              the writer came for, and it was reachable only after two taps.
              Padding is tighter than the desktop button because at 390px the
              bar has to hold أقلامنا + four controls without scrolling. */}
          {isPhone && (
            <button
              onClick={handleExport}
              data-export-button
              aria-label="تصدير القصة"
              style={{
                minBlockSize: "44px",
                minInlineSize: "44px",
                paddingBlock: "0.5rem",
                paddingInline: "0.625rem",
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
                data-run-button
                aria-label="شغّل القصة"
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
                data-export-button
                aria-label="تصدير القصة"
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
                      button in the bar, next to ▶ شغّل. تصدير IS duplicated,
                      deliberately: it has a bar button now AND stays here,
                      because this is where anyone who learned the menu first
                      will keep looking for it. */}
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

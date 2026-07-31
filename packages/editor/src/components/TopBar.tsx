// ---------------------------------------------------------------------------
// TopBar — project title, view toggle [نص] [مخطط] [الاثنان],
// [▶ شغّل] play, [⬇ تصدير] export, [⚙️] settings, [🤖] AI actions.
// ---------------------------------------------------------------------------

import { useStore } from "../store.js";
import { exportStoryForDownload, downloadHtml } from "../lib/export-html.js";
import SettingsPanel from "./SettingsPanel.js";
import { useState, useCallback } from "react";

const HelpLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    style={{ display: "block", padding: "0.5rem 1rem", fontSize: "0.875rem",
      color: "var(--aq-text)", textDecoration: "none", whiteSpace: "nowrap" }}>
    {children}
  </a>
);

export default function TopBar() {
  const storyJson = useStore((s) => s.storyJson);
  const compileSource = useStore((s) => s.compileSource);
  const panePlayer = useStore((s) => s.panePlayer);
  const paneText = useStore((s) => s.paneText);
  const paneCanvas = useStore((s) => s.paneCanvas);
  const togglePanePlayer = useStore((s) => s.togglePanePlayer);
  const togglePaneText = useStore((s) => s.togglePaneText);
  const togglePaneCanvas = useStore((s) => s.togglePaneCanvas);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((v) => !v);
  }, []);

  const handlePlay = () => {
    compileSource();
  };

  const handleExport = async () => {
    // Use existing compiled story if available, otherwise compile first
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
  };

  return (
    <>
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          background: "var(--aq-surface)",
          borderBlockEnd: "1px solid var(--aq-border)",
          flexShrink: 0,
        }}
      >
        {/* Top row: title + view toggle + action buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBlock: "0.5rem",
            paddingInline: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "var(--aq-accent)",
              }}
            >
              أقلامنا
            </span>
            <span
              style={{
                fontSize: "0.9375rem",
                color: "var(--aq-muted)",
              }}
            >
              المحرر
            </span>
          </div>

          {/* Pane toggles */}
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {[
              { key: "player", label: "شغّل", on: panePlayer, toggle: togglePanePlayer },
              { key: "text", label: "نص", on: paneText, toggle: togglePaneText },
              { key: "canvas", label: "مخطط", on: paneCanvas, toggle: togglePaneCanvas },
            ].map((t) => (
              <button
                key={t.key}
                onClick={t.toggle}
                style={{
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

          <div style={{ display: "flex", gap: "0.5rem" }}>
            {/* Help button */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowHelp((v) => !v)}
                title="مساعدة"
                style={{
                  paddingBlock: "0.5rem",
                  paddingInline: "0.75rem",
                  fontSize: "0.9375rem",
                  fontFamily: "inherit",
                  color: "var(--aq-muted)",
                  background: "var(--aq-surface-hi)",
                  border: "1px solid var(--aq-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                ❓
              </button>
              {showHelp && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    insetInlineEnd: 0,
                    marginBlockStart: "0.25rem",
                    background: "var(--aq-surface)",
                    border: "1px solid var(--aq-border)",
                    borderRadius: "6px",
                    padding: "0.5rem 0",
                    zIndex: 100,
                    minInlineSize: "180px",
                  }}
                >
                  <HelpLink href="/docs/البداية.html">📖 البداية — الدليل التعليمي</HelpLink>
                  <HelpLink href="/docs/المرجع.html">📚 المرجع — دليل اللغة</HelpLink>
                  <HelpLink href="/docs/الأخطاء.html">⚠️ الأخطاء — رموز الخطأ</HelpLink>
                </div>
              )}
            </div>

            {/* Settings button */}
            <button
              onClick={toggleSettings}
              title="الإعدادات"
              style={{
                paddingBlock: "0.5rem",
                paddingInline: "0.75rem",
                fontSize: "0.9375rem",
                fontFamily: "inherit",
                color: "var(--aq-muted)",
                background: "var(--aq-surface-hi)",
                border: "1px solid var(--aq-border)",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              ⚙️ الإعدادات
            </button>

            {/* Play button */}
            <button
              onClick={handlePlay}
              style={{
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
              }}
            >
              ▶ شغّل
            </button>

            {/* Export button */}
            <button
              onClick={handleExport}
              style={{
                paddingBlock: "0.5rem",
                paddingInline: "1.25rem",
                fontSize: "0.9375rem",
                fontFamily: "inherit",
                color: "var(--aq-text)",
                background: "var(--aq-surface-hi)",
                border: "1px solid var(--aq-border-hi)",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              ⬇ تصدير
            </button>
          </div>
        </div>

        {/* AI actions moved to EditorPane header */}
      </header>

      {/* Settings modal */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

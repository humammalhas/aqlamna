// ---------------------------------------------------------------------------
// TopBar — project title, view toggle [نص] [مخطط] [الاثنان],
// [▶ شغّل] play, [⬇ تصدير] export, [⚙️] settings, [🤖] AI actions.
// ---------------------------------------------------------------------------

import { useStore } from "../store.js";
import { buildStandaloneHtml, downloadHtml } from "../lib/export-html.js";
import SettingsPanel from "./SettingsPanel.js";
import AIActions from "./AIActions.js";
import { useState, useCallback } from "react";

const HelpLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer"
    style={{ display: "block", padding: "0.5rem 1rem", fontSize: "0.875rem",
      color: "#e0d6c2", textDecoration: "none", whiteSpace: "nowrap" }}>
    {children}
  </a>
);

export default function TopBar() {
  const storyJson = useStore((s) => s.storyJson);
  const compileSource = useStore((s) => s.compileSource);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const playerTheme = useStore((s) => s.playerTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((v) => !v);
  }, []);

  const viewModes = [
    { id: "text" as const, label: "نص" },
    { id: "canvas" as const, label: "مخطط" },
    { id: "split" as const, label: "الاثنان" },
  ];

  const handlePlay = () => {
    compileSource();
  };

  const handleExport = () => {
    // Use existing compiled story if available, otherwise compile first
    let json = storyJson;
    if (!json) {
      compileSource();
      json = useStore.getState().storyJson;
    }
    if (!json) return; // compilation failed

    const html = buildStandaloneHtml(json, playerTheme);
    const baseName = (json.title ?? "قصة").replace(/[<>:"/\\|?*]/g, "_");
    downloadHtml(html, `${baseName}.html`);
  };

  return (
    <>
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#1c1917",
          borderBlockEnd: "1px solid #3a3528",
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
                color: "#d4a843",
              }}
            >
              أقلامنا
            </span>
            <span
              style={{
                fontSize: "0.9375rem",
                color: "#9a8c70",
              }}
            >
              المحرر
            </span>
          </div>

          {/* View mode toggle */}
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {viewModes.map((vm) => (
              <button
                key={vm.id}
                onClick={() => setViewMode(vm.id)}
                style={{
                  paddingBlock: "0.375rem",
                  paddingInline: "0.75rem",
                  fontSize: "0.8125rem",
                  fontWeight: viewMode === vm.id ? 700 : 400,
                  fontFamily: "inherit",
                  color: viewMode === vm.id ? "#141210" : "#9a8c70",
                  background: viewMode === vm.id ? "#d4a843" : "#2a2620",
                  border: viewMode === vm.id ? "none" : "1px solid #3a3528",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {vm.label}
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
                  color: "#9a8c70",
                  background: "#2a2620",
                  border: "1px solid #3a3528",
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
                    background: "#1c1917",
                    border: "1px solid #3a3528",
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
                color: "#9a8c70",
                background: "#2a2620",
                border: "1px solid #3a3528",
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
                color: "#141210",
                background: "#d4a843",
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
                color: "#e0d6c2",
                background: "#2a2620",
                border: "1px solid #4a4030",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              ⬇ تصدير
            </button>
          </div>
        </div>

        {/* Bottom row: AI actions bar */}
        <div
          style={{
            paddingBlock: "0.375rem",
            paddingInline: "1rem",
            borderBlockStart: "1px solid #2a2620",
          }}
        >
          <AIActions onOpenSettings={toggleSettings} />
        </div>
      </header>

      {/* Settings modal */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

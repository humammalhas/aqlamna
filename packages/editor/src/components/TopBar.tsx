// ---------------------------------------------------------------------------
// TopBar — project title, [▶ شغّل] play button, [⬇ تصدير] export button,
// [⚙️] settings, and [🤖] AI actions.
// ---------------------------------------------------------------------------

import { useStore } from "../store.js";
import { buildStandaloneHtml, downloadHtml } from "../lib/export-html.js";
import SettingsPanel from "./SettingsPanel.js";
import AIActions from "./AIActions.js";
import { useState, useCallback } from "react";

export default function TopBar() {
  const storyJson = useStore((s) => s.storyJson);
  const compileSource = useStore((s) => s.compileSource);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((v) => !v);
  }, []);

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

    const html = buildStandaloneHtml(json);
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
        {/* Top row: title + play & export buttons */}
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

          <div style={{ display: "flex", gap: "0.5rem" }}>
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
              ⚙️
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
          <AIActions />
        </div>
      </header>

      {/* Settings modal */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

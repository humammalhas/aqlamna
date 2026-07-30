// ---------------------------------------------------------------------------
// SettingsPanel — modal for entering the DeepSeek API key.
// Key stored in localStorage only, never committed, never sent anywhere but
// DeepSeek. UI in Arabic.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { getApiKey, setApiKey, clearApiKey } from "../lib/ai-keys.js";

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      const current = getApiKey();
      setKey(current ?? "");
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    setApiKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    clearApiKey();
    setKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: "#1c1917",
          border: "1px solid #3a3528",
          borderRadius: "8px",
          padding: "1.5rem",
          maxWidth: "440px",
          width: "90%",
          direction: "rtl",
        }}
      >
        <h3
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "#d4a843",
            margin: 0,
            marginBlockEnd: "0.75rem",
          }}
        >
          ⚙️ الإعدادات
        </h3>

        <p
          style={{
            fontSize: "0.875rem",
            color: "#9a8c70",
            lineHeight: 1.7,
            marginBlockEnd: "1rem",
          }}
        >
          أدخل مفتاح DeepSeek API لتفعيل المساعدة بالذكاء الاصطناعي.
        </p>

        <div style={{ marginBlockEnd: "0.75rem" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.8125rem",
              color: "#8a8070",
              marginBlockEnd: "0.375rem",
            }}
          >
            مفتاح API
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-..."
            style={{
              width: "100%",
              paddingBlock: "0.5rem",
              paddingInline: "0.75rem",
              fontSize: "0.9375rem",
              fontFamily: "monospace",
              direction: "ltr",
              backgroundColor: "#0e0d0b",
              color: "#e0d6c2",
              border: "1px solid #3a3528",
              borderRadius: "6px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            fontSize: "0.75rem",
            color: "#6a6450",
            lineHeight: 1.6,
            marginBlockEnd: "1rem",
          }}
        >
          🔒 يُخزّن المفتاح في متصفحك فقط. لا يُرسل إلى أي جهة غير DeepSeek. لا
          يُحفَظ في الخادم ولا يُضمَّن في الملفات المصدرّة.
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          {saved && (
            <span style={{ fontSize: "0.8125rem", color: "#60b060", alignSelf: "center", marginInlineEnd: "auto" }}>
              ✓ حُفظ
            </span>
          )}
          <button
            onClick={handleClear}
            style={{
              paddingBlock: "0.375rem",
              paddingInline: "0.75rem",
              fontSize: "0.8125rem",
              fontFamily: "inherit",
              color: "#c06050",
              background: "transparent",
              border: "1px solid #4a3030",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            مسح المفتاح
          </button>
          <button
            onClick={handleSave}
            style={{
              paddingBlock: "0.375rem",
              paddingInline: "0.75rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              fontFamily: "inherit",
              color: "#141210",
              background: "#d4a843",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            حفظ
          </button>
          <button
            onClick={onClose}
            style={{
              paddingBlock: "0.375rem",
              paddingInline: "0.75rem",
              fontSize: "0.8125rem",
              fontFamily: "inherit",
              color: "#8a8070",
              background: "#2a2620",
              border: "1px solid #3a3528",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingOverlay — shown on first visit only.
// Persists a flag in localStorage; never shown again once dismissed.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";

const STORAGE_KEY = "aqlamna-onboarding-done";

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnboardingDone()) {
      // Small delay so the editor has time to render underneath
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* noop */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(10, 9, 7, 0.92)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        direction: "rtl",
        padding: "2rem",
      }}
      role="dialog"
      aria-label="مرحبًا بك في أقلامنا"
    >
      <div
        style={{
          maxInlineSize: "28rem",
          textAlign: "center",
          color: "#e0d6c2",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#d4a843",
            marginBlockEnd: "1.25rem",
          }}
        >
          أهلاً بك في أقلامنا
        </h2>

        <p
          style={{
            fontSize: "1rem",
            color: "#b8a88a",
            marginBlockEnd: "1.5rem",
            lineHeight: 1.75,
          }}
        >
          محرر قصص تفاعلية بالعربية — اكتب قصتك، شغّلها، وصدّرها في ملف واحد.
        </p>

        <ol
          style={{
            listStyle: "none",
            padding: 0,
            marginBlockEnd: "1.25rem",
            fontSize: "1rem",
            color: "#c0b090",
            lineHeight: 2,
          }}
        >
          <li>١. اكتب قصتك</li>
          <li>٢. اضغط شغّل لتجربها</li>
          <li>٣. اضغط تصدير لمشاركتها</li>
        </ol>

        <p
          style={{
            fontSize: "0.875rem",
            color: "#8a7d66",
            marginBlockEnd: "2rem",
            lineHeight: 1.6,
          }}
        >
          للكتابة بمساعدة الذكاء الاصطناعي، أضف مفتاحك من ⚙️ الإعدادات
        </p>

        <button
          onClick={dismiss}
          style={{
            paddingBlock: "0.75rem",
            paddingInline: "3rem",
            fontSize: "1.125rem",
            fontWeight: 700,
            fontFamily: "inherit",
            color: "#1a1713",
            background: "#d4a843",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          ابدأ
        </button>
      </div>
    </div>
  );
}

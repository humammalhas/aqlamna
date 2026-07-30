// ---------------------------------------------------------------------------
// ErrorStrip — shows QalamError in Arabic with code + line:column.
// ---------------------------------------------------------------------------

import { useStore, type QalamError } from "../store.js";

interface ErrorStripProps {
  error: QalamError | null;
  onDismiss: () => void;
}

export default function ErrorStrip({ error, onDismiss }: ErrorStripProps) {
  if (!error) return null;

  return (
    <div
      className="error-strip"
      style={{
        background: "var(--aq-error-bg)",
        borderBlockStart: "1px solid var(--aq-error-text)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
        }}
      >
        <div style={{ minInlineSize: 0 }}>
          <span style={{ fontWeight: 700, color: "var(--aq-error-text)" }}>
            {error.code}
          </span>
          <span style={{ color: "var(--aq-muted)", marginInlineStart: "0.75rem" }}>
            سطر {error.line}:{error.column}
          </span>
          <p style={{ color: "var(--aq-btn-danger-border)", marginBlockStart: "0.25rem" }}>
            {error.message_ar}
          </p>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "var(--aq-error-text)",
            fontSize: "1.25rem",
            cursor: "pointer",
            lineHeight: 1,
            padding: 0,
          }}
          title="إغلاق"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

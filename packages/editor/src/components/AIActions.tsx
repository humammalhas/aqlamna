// ---------------------------------------------------------------------------
// AIActions — collapsible AI co-writing panel.
//
// Collapsed: ✨ اكتب معي ⌄
// Expanded:  textarea + 3 action buttons + one hint.
// State persisted in localStorage.
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect } from "react";
import { useStore } from "../store.js";
import { hasApiKey } from "../lib/ai-keys.js";
import {
  callAI,
  extractPassageNames,
  extractVariableNames,
  type AIAction,
  type AIResponse,
} from "../lib/ai.js";

const COLLAPSED_KEY = "aqlamna-ai-collapsed";

function loadCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) !== "false"; } catch { return true; }
}
function saveCollapsed(v: boolean) {
  try { localStorage.setItem(COLLAPSED_KEY, String(v)); } catch { /* noop */ }
}

// ---- Component -------------------------------------------------------------

export default function AIActions() {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [actionLabel, setActionLabel] = useState("");
  const [humanInstruction, setHumanInstruction] = useState("");

  const keyAvailable = hasApiKey();

  // Hydrate collapsed state from localStorage (default: collapsed)
  useEffect(() => {
    setOpen(!loadCollapsed());
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      saveCollapsed(next);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (action: AIAction, label: string) => {
      setLoading(true);
      setResponse(null);
      setActionLabel(label);

      const passageNames = extractPassageNames(source);
      const variableNames = extractVariableNames(source);
      const contextText = getContextText(source);

      try {
        const res = await callAI({
          action,
          fullSource: source,
          contextText,
          humanInstruction,
          passageNames,
          variableNames,
        });
        setResponse(res);
      } catch {
        setResponse({
          raw: "",
          valid: null,
          error: "حدث خطأ غير متوقع أثناء الاتصال.",
        });
      } finally {
        setLoading(false);
      }
    },
    [source, humanInstruction],
  );

  const handleAccept = () => {
    if (!response?.valid) return;
    const newSource = source + "\n" + response.valid;
    setSource(newSource);
    setResponse(null);
  };

  const handleDismiss = () => setResponse(null);

  // ---- Collapsed button ------------------------------------------------------
  if (!open) {
    return (
      <button
        onClick={toggleOpen}
        title="الكتابة بمساعدة الذكاء الاصطناعي"
        style={{
          paddingBlock: "0.25rem",
          paddingInline: "0.625rem",
          fontSize: "0.8125rem",
          fontFamily: "inherit",
          color: "var(--aq-muted)",
          background: "transparent",
          border: "1px solid var(--aq-border)",
          borderRadius: "6px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ✨ اكتب معي ▾
      </button>
    );
  }

  // ---- Expanded panel --------------------------------------------------------
  return (
    <div style={{ direction: "rtl" }}>
      {/* Header row: label + collapse button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBlockEnd: "0.5rem" }}>
        <button
          onClick={toggleOpen}
          style={{
            paddingBlock: "0.25rem",
            paddingInline: "0.625rem",
            fontSize: "0.8125rem",
            fontFamily: "inherit",
            color: "var(--aq-muted)",
            background: "transparent",
            border: "1px solid var(--aq-border)",
            borderRadius: "6px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ✨ اكتب معي ▴
        </button>
        <span style={{ fontSize: "0.75rem", color: "var(--aq-muted)" }}>الكتابة بمساعدة الذكاء الاصطناعي</span>
      </div>

      {/* Textarea */}
      <textarea
        value={humanInstruction}
        onChange={(e) => setHumanInstruction(e.target.value)}
        placeholder={keyAvailable ? "مثال: اكتب مشهدًا في سوق قديم، الراوي خائف" : ""}
        disabled={!keyAvailable}
        rows={2}
        style={{
          inlineSize: "100%",
          paddingBlock: "0.375rem",
          paddingInline: "0.5rem",
          fontSize: "0.8125rem",
          fontFamily: "inherit",
          color: "var(--aq-text)",
          backgroundColor: "var(--aq-input-bg)",
          border: "1px solid var(--aq-border)",
          borderRadius: "6px",
          outline: "none",
          resize: "vertical",
          lineHeight: 1.6,
          boxSizing: "border-box",
        }}
      />

      {/* No-key note — quiet one line */}
      {!keyAvailable && (
        <div style={{ marginBlockStart: "0.25rem", fontSize: "0.75rem", color: "var(--aq-dim)" }}>
          أضف مفتاح API من الإعدادات ⚙️ لتفعيل المساعدة
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBlockStart: "0.5rem" }}>
        <AIButton
          label="اقترح خيارات"
          title="اقتراح 3 خيارات بصيغة .qalam للمقطع الحالي"
          disabled={!keyAvailable || loading}
          loading={loading && actionLabel === "اقترح خيارات"}
          onClick={() => runAction("suggest_choices", "اقترح خيارات")}
        />
        <AIButton
          label="أكمل المشهد"
          title="استمرار السرد النثري للمقطع الحالي"
          disabled={!keyAvailable || loading}
          loading={loading && actionLabel === "أكمل المشهد"}
          onClick={() => runAction("continue_scene", "أكمل المشهد")}
        />
        <AIButton
          label="اكتب هذا المقطع"
          title="كتابة مقطع جديد كامل (نص + خيارات)"
          disabled={!keyAvailable || loading}
          loading={loading && actionLabel === "اكتب هذا المقطع"}
          onClick={() => runAction("write_passage", "اكتب هذا المقطع")}
        />
      </div>

      {/* Preview panel */}
      {response && (
        <div
          style={{
            marginBlockStart: "0.75rem",
            border: "1px solid var(--aq-border)",
            borderRadius: "6px",
            backgroundColor: "var(--aq-bg-deep)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBlock: "0.5rem",
              paddingInline: "0.75rem",
              backgroundColor: "var(--aq-editor-bg)",
              borderBlockEnd: "1px solid var(--aq-border)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--aq-accent)" }}>
              {actionLabel}
            </span>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              {response.valid && (
                <button
                  onClick={handleAccept}
                  style={{
                    paddingBlock: "0.25rem",
                    paddingInline: "0.75rem",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    fontFamily: "inherit",
                    color: "var(--aq-editor-bg)",
                    background: "var(--aq-success)",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  ✓ أضف
                </button>
              )}
              <button
                onClick={handleDismiss}
                style={{
                  paddingBlock: "0.25rem",
                  paddingInline: "0.75rem",
                  fontSize: "0.8125rem",
                  fontFamily: "inherit",
                  color: "var(--aq-danger)",
                  background: "transparent",
                  border: "1px solid var(--aq-btn-danger-border)",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                ✕ تجاهل
              </button>
            </div>
          </div>
          <div
            style={{
              padding: "0.75rem",
              fontSize: "0.875rem",
              color: "var(--aq-dim)",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
              maxBlockSize: "16rem",
              overflowY: "auto",
              direction: "rtl",
            }}
          >
            {response.error ? (
              <div>
                <div
                  style={{
                    color: "var(--aq-danger)",
                    marginBlockEnd: "0.5rem",
                    padding: "0.5rem",
                    backgroundColor: "var(--aq-danger-bg)",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                    whiteSpace: "pre-wrap",
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  ⚠️ {response.error}
                </div>
                <div style={{ color: "var(--aq-muted)", fontSize: "0.75rem", marginBlockEnd: "0.5rem" }}>
                  النص الخام (غير صالح للتجميع):
                </div>
                <div style={{ opacity: 0.7 }}>{response.raw}</div>
              </div>
            ) : (
              response.raw
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- AIButton sub-component -------------------------------------------------

function AIButton({
  label,
  title,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  title: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        paddingBlock: "0.375rem",
        paddingInline: "0.75rem",
        fontSize: "0.8125rem",
        fontFamily: "inherit",
        color: disabled ? "var(--aq-dim)" : "var(--aq-accent)",
        background: disabled ? "var(--aq-bg-deep)" : "var(--aq-surface-hi)",
        border: `1px solid ${disabled ? "var(--aq-surface-hi)" : "var(--aq-border-hi)"}`,
        borderRadius: "6px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {loading ? "⏳" : "🤖"} {label}
    </button>
  );
}

// ---- Helpers ---------------------------------------------------------------

function getContextText(source: string): string {
  if (!source || source.trim().length === 0) return "";
  const passageRe = /^===\s+.+?\s+===/gm;
  const matches = [...source.matchAll(passageRe)];
  if (matches.length === 0) {
    const lines = source.split("\n");
    return lines.slice(-20).join("\n");
  }
  const lastMatch = matches[matches.length - 1]!;
  const startIdx = lastMatch.index! + lastMatch[0].length;
  const afterPassage = source.slice(startIdx);
  const nextHeader = afterPassage.search(/^===\s+.+?\s+===/m);
  const content = nextHeader === -1 ? afterPassage : afterPassage.slice(0, nextHeader);
  return content.trim();
}

// ---------------------------------------------------------------------------
// AIActions — the three AI co-writing buttons + preview panel.
//
// Three actions:
//   اقترح خيارات — suggest 3 choices in .qalam syntax
//   أكمل المشهد — draft a continuation of the current passage's prose
//   اكتب هذا المقطع — draft a divert target that has no passage yet
//
// Human in the loop: every suggestion shows in a preview panel with [أضف] and
// [تجاهل]. Nothing is auto-applied. Invalid text is shown raw with the error.
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import { useStore } from "../store.js";
import { hasApiKey } from "../lib/ai-keys.js";
import {
  callAI,
  extractPassageNames,
  extractVariableNames,
  type AIAction,
  type AIResponse,
} from "../lib/ai.js";

// ---- Component -------------------------------------------------------------

export default function AIActions({ onOpenSettings }: { onOpenSettings: () => void }) {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [actionLabel, setActionLabel] = useState("");
  const [humanInstruction, setHumanInstruction] = useState("");

  const keyAvailable = hasApiKey();

  const runAction = useCallback(
    async (action: AIAction, label: string) => {
      setLoading(true);
      setResponse(null);
      setActionLabel(label);

      const passageNames = extractPassageNames(source);
      const variableNames = extractVariableNames(source);

      // For context, use the text around where the author is likely working.
      // We use the last passage's content as context, or the full source tail.
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
    [source],
  );

  const handleAccept = () => {
    if (!response?.valid) return;
    // Append the valid text at the end of the current source
    const newSource = source + "\n" + response.valid;
    setSource(newSource);
    setResponse(null);
  };

  const handleDismiss = () => {
    setResponse(null);
  };

  // ---- Render ---------------------------------------------------------------

  return (
    <div style={{ direction: "rtl" }}>
      {/* Human instruction textarea */}
      <div style={{ marginBlockEnd: "0.5rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.75rem",
            color: "var(--aq-muted)",
            marginBlockEnd: "0.25rem",
          }}
        >
          اكتب ما تريد من الذكاء الاصطناعي
        </label>
        <textarea
          value={humanInstruction}
          onChange={(e) => setHumanInstruction(e.target.value)}
          disabled={!keyAvailable}
          placeholder="مثال: اكتب مشهدًا في سوق قديم، الراوي خائف"
          rows={3}
          style={{
            inlineSize: "100%",
            paddingBlock: "0.5rem",
            paddingInline: "0.625rem",
            fontSize: "0.875rem",
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
        {!keyAvailable && (
          <div
            style={{
              marginBlockStart: "0.25rem",
              fontSize: "0.75rem",
              color: "var(--aq-muted)",
              lineHeight: 1.6,
            }}
          >
            أضف مفتاح الذكاء الاصطناعي من{" "}
            <button onClick={onOpenSettings} style={{ fontSize: "inherit", fontFamily: "inherit", color: "var(--aq-accent)", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}>
              الإعدادات
            </button>{" "}
            لتفعيل هذه الأزرار
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: "0.375rem",
          flexWrap: "wrap",
        }}
      >
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

      {/* No-key message */}
      {!keyAvailable && (
        <div
          style={{
            marginBlockStart: "0.5rem",
            fontSize: "0.75rem",
            color: "var(--aq-muted)",
            lineHeight: 1.6,
          }}
        >
          أضف مفتاح الذكاء الاصطناعي من{" "}
          <button
            onClick={onOpenSettings}
            style={{
              fontSize: "inherit",
              fontFamily: "inherit",
              color: "var(--aq-accent)",
              background: "none",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
            }}
          >
            الإعدادات
          </button>{" "}
          لتفعيل هذه الأزرار
        </div>
      )}

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
          {/* Header */}
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

          {/* Content */}
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
              direction: response.valid ? "rtl" : "rtl",
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
                <div
                  style={{
                    color: "var(--aq-muted)",
                    fontSize: "0.75rem",
                    marginBlockEnd: "0.5rem",
                  }}
                >
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

/**
 * Extract the contextual text for AI prompts — the last passage in the source
 * gives the AI the best context about what the author is working on.
 */
function getContextText(source: string): string {
  if (!source || source.trim().length === 0) return "";

  // Find the last passage and return its content
  const passageRe = /^===\s+.+?\s+===/gm;
  const matches = [...source.matchAll(passageRe)];

  if (matches.length === 0) {
    // No passages yet — return the last 20 lines of source as context
    const lines = source.split("\n");
    return lines.slice(-20).join("\n");
  }

  // Content of the last passage
  const lastMatch = matches[matches.length - 1]!;
  const startIdx = lastMatch.index! + lastMatch[0].length;
  const afterPassage = source.slice(startIdx);

  // Content ends at the next passage header or end of file
  const nextHeader = afterPassage.search(/^===\s+.+?\s+===/m);
  const content = nextHeader === -1 ? afterPassage : afterPassage.slice(0, nextHeader);

  return content.trim();
}

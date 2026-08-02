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
import { applyAIFragment, aiTargetScene, sceneContextText } from "../lib/writer-ai.js";

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
  const writerMode = useStore((s) => s.writerMode);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [action, setAction] = useState<AIAction>("continue_scene");
  const [actionLabel, setActionLabel] = useState("");
  const [humanInstruction, setHumanInstruction] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);

  const keyAvailable = hasApiKey();

  /**
   * Seconds since the request went out, shown while it is in flight.
   *
   * Measured on the models this editor actually talks to: Groq 0.7s, DeepSeek
   * 1.5s, Together 3.2s, Gemini 3.2s — and `qwen3:14b` on a local box **59.5s**.
   * A minute with nothing moving reads as a hang, and the author's next move is
   * to press the button again.
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const started = performance.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  /**
   * The card أضف will change, named on screen.
   *
   * Read from the store at render time rather than remembered from the request:
   * the author may focus another card while the answer is on screen, and the
   * apply reads the focus at the moment it runs, not at the moment it asked.
   */
  const writerState = useStore((s) => s.writerState);
  const writerFocusScene = useStore((s) => s.writerFocusScene);
  const targetLabel =
    writerMode !== "visual" || !writerState
      ? ""
      : action === "write_passage"
        ? "مقطع جديد في آخر القصة"
        : (() => {
            const target = aiTargetScene(writerState, writerFocusScene);
            return target ? `إلى المقطع: ${target.title || "دون اسم"}` : "";
          })();

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
      setApplyError(null);
      setAction(action);
      setActionLabel(label);

      const passageNames = extractPassageNames(source);
      const variableNames = extractVariableNames(source);

      // Ask about the scene the answer will land in. In code mode that is the
      // last passage, where the cursor is; in the form it is the card the
      // author last touched, which is rarely the last one.
      // Resolved the same way the apply resolves it, so the question and the
      // answer are about the same card even when the remembered focus is stale.
      const { writerMode: mode, writerState, writerFocusScene } = useStore.getState();
      const focused =
        mode === "visual" && writerState
          ? sceneContextText(writerState, aiTargetScene(writerState, writerFocusScene)?.id ?? null)
          : "";
      const contextText = focused || getContextText(source);

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

  /**
   * Where an accepted suggestion lands.
   *
   * In code mode it is appended to the source, as it always was. In the visual
   * writer it is folded into the scene cards — prose into the scene the author
   * last touched, choices as new sub-cards, a written passage as a new scene.
   * If the fold fails, the suggestion is kept on screen with the reason: an
   * "أضف" that silently does nothing is the worst of the three outcomes.
   */
  const handleAccept = () => {
    if (!response?.valid) return;

    if (writerMode === "code") {
      setSource(source + "\n" + response.valid);
      setResponse(null);
      return;
    }

    const { writerState, writerFocusScene, setWriterState } = useStore.getState();
    if (!writerState) {
      setApplyError("افتح المحرّر المرئي على قصة أولًا.");
      return;
    }
    const result = applyAIFragment(writerState, action, response.valid, writerFocusScene);
    if (!result.ok) {
      setApplyError(result.reason);
      return;
    }
    setWriterState(result.state);
    // Take the author to what just happened. A new scene card is appended at the
    // bottom of the list and an accepted suggestion usually lands off-screen, so
    // أضف looked like it had done nothing until they went looking for it.
    useStore.getState().requestWriterScroll(result.sceneId);
    setResponse(null);
    setApplyError(null);
  };

  const handleDismiss = () => { setResponse(null); setApplyError(null); };

  // ---- Collapsed button ------------------------------------------------------
  if (!open) {
    return (
      <button
        onClick={toggleOpen}
        title="الكتابة بمساعدة الذكاء الاصطناعي"
        style={{
          // Collapsed, it is a small button that stays at the end of the row.
          marginInlineStart: "auto",
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
    <div style={{ direction: "rtl", flex: "1 1 100%", inlineSize: "100%", minInlineSize: 0 }}>
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
        placeholder={keyAvailable ? "مثال: اكتب مقطعًا في سوق قديم، الراوي خائف" : ""}
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
          label="أكمل المقطع"
          title="استمرار السرد النثري للمقطع الحالي"
          disabled={!keyAvailable || loading}
          loading={loading && actionLabel === "أكمل المقطع"}
          onClick={() => runAction("continue_scene", "أكمل المقطع")}
        />
        <AIButton
          label="اكتب هذا المقطع"
          title="كتابة مقطع جديد كامل (نص + خيارات)"
          disabled={!keyAvailable || loading}
          loading={loading && actionLabel === "اكتب هذا المقطع"}
          onClick={() => runAction("write_passage", "اكتب هذا المقطع")}
        />
      </div>

      {/* Alive, and counting. The spinner says "working"; the seconds say how
          long, so a slow model is slow rather than broken. */}
      {loading && (
        <p
          data-ai-status={elapsed}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            marginBlockStart: "0.5rem",
            marginBlockEnd: 0,
            fontSize: "0.75rem",
            color: "var(--aq-muted)",
          }}
        >
          <span className="aq-spinner" aria-hidden="true" />
          <span role="status">
            {actionLabel ? `${actionLabel}…` : "يعمل…"} منذ {elapsed} ث
            {elapsed >= 12 && " — بعض النماذج تحتاج نصف دقيقة أو أكثر. لا تضغط مرّة أخرى."}
          </span>
        </p>
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
              {/* Where أضف will put it, said BEFORE it is pressed. The author
                  used to press it and then go looking for what had changed. */}
              {response.valid && targetLabel && (
                <span style={{ fontWeight: 400, color: "var(--aq-muted)" }}> — {targetLabel}</span>
              )}
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
              // The visual writer promises no syntax on screen. A preview in
              // monospace `.qalam` would break that promise at the one moment
              // the author is deciding whether to trust the tool.
              fontFamily: writerMode === "visual" ? "inherit" : "monospace",
              maxBlockSize: "16rem",
              overflowY: "auto",
              direction: "rtl",
            }}
          >
            {applyError && (
              <div
                style={{
                  color: "var(--aq-danger)",
                  marginBlockEnd: "0.5rem",
                  padding: "0.5rem",
                  backgroundColor: "var(--aq-danger-bg)",
                  borderRadius: "4px",
                  fontSize: "0.8125rem",
                  fontFamily: "inherit",
                }}
              >
                ⚠️ {applyError}
              </div>
            )}
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
            ) : writerMode === "visual" ? (
              readable(response.valid ?? response.raw)
            ) : (
              response.raw
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Preview text -----------------------------------------------------------

/**
 * The suggestion as prose, for the visual writer's preview.
 *
 * Display only — the text that is actually applied is `response.valid`, which
 * went through the compiler. This never feeds anything but the screen, so a
 * line it fails to prettify is a cosmetic miss, not a corrupted story.
 */
function readable(qalam: string): string {
  return qalam
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t.length === 0) return "";
      if (t.startsWith("~")) return ""; // a tag or counter change has no prose
      const divert = t.match(/^->\s*(.+)$/);
      if (divert) return `↩ ينتقل إلى: ${divert[1]}`;
      const choice = t.match(/^[*+]+\s*(?:\{[^}]*\}\s*)?\[([^\]]*)\]\s*(.*)$/);
      if (choice) return `• ${choice[1]}${choice[2] ? ` — ${choice[2]}` : ""}`;
      return t;
    })
    .filter((l, i, all) => l.length > 0 || (i > 0 && all[i - 1]!.length > 0))
    .join("\n")
    .trim();
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
        // A button that is busy must not look like a button that is dead.
        // Both were drawn in --aq-dim at 0.6 opacity, so "thinking" and
        // "unavailable" were the same picture — and thinking can last a minute
        // on a local model.
        color: disabled && !loading ? "var(--aq-dim)" : "var(--aq-accent)",
        background: disabled && !loading ? "var(--aq-bg-deep)" : "var(--aq-surface-hi)",
        border: `1px solid ${disabled && !loading ? "var(--aq-surface-hi)" : "var(--aq-border-hi)"}`,
        borderRadius: "6px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !loading ? 0.6 : 1,
        whiteSpace: "nowrap",
      }}
      className={loading ? "aq-working" : undefined}
    >
      {loading ? <span className="aq-spinner" aria-hidden="true" /> : "🤖"} {label}
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

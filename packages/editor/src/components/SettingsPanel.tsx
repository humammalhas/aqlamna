// ---------------------------------------------------------------------------
// SettingsPanel — multi-provider settings modal.
// Provider picker, model selector, base URL, API key, per-provider instructions.
// Keys stored per-provider in localStorage — switching keeps the previous key.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import {
  getSelectedProviderId,
  setSelectedProviderId,
  getSelectedProvider,
  getApiKey,
  setApiKey,
  clearApiKey,
  getSelectedModel,
  setSelectedModel,
  getCustomBaseUrl,
  setCustomBaseUrl,
  getEffectiveModel,
  getEffectiveBaseUrl,
  getImageProviderId,
  setImageProviderId,
  getImageProvider,
  getImageApiKey,
} from "../lib/ai-keys.js";
import {
  ALL_PROVIDERS,
  ALL_LOCAL,
  type ProviderConfig,
} from "../lib/providers.js";
import { getRulesMeta } from "@aqlamna/linter";
import { useStore } from "../store.js";

// Providers where the model field accepts any free-text ID.
const ANY_MODEL_IDS = new Set(["openrouter", "lmstudio"]);

// Cloud providers: everything that is NOT local.
const CLOUD_PROVIDERS = ALL_PROVIDERS.filter((p) => !ALL_LOCAL.includes(p));

// Providers that support image generation.
const IMAGE_PROVIDERS = ALL_PROVIDERS.filter((p) => p.supportsImages);

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [selectedId, setSelectedId] = useState(getSelectedProviderId());
  const provider = getProviderSafe(selectedId);

  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saved, setSaved] = useState(false);

  // Image provider state (independent from text provider)
  const [imageProvId, setImageProvId] = useState(getImageProviderId());
  const [imageKey, setImageKey] = useState(getImageApiKey() ?? "");
  const [imageSaved, setImageSaved] = useState(false);

  // Load current values when modal opens or provider changes
  useEffect(() => {
    if (!open) return;
    setSelectedId(getSelectedProviderId());
  }, [open]);

  const currentProvider = getProviderSafe(selectedId);

  useEffect(() => {
    setKey(getApiKey(selectedId) ?? "");
    setModel(getSelectedModel() || currentProvider.defaultModel);
    setBaseUrl(
      getCustomBaseUrl() ||
        (currentProvider.supportsCustomBaseUrl ? currentProvider.baseUrl : ""),
    );
    setSaved(false);
  }, [selectedId, currentProvider]);

  const handleProviderChange = useCallback(
    (id: string) => {
      setSelectedProviderId(id);
      setSelectedId(id);
    },
    [],
  );

  const handleSave = () => {
    const p = getProviderSafe(selectedId);
    if (p.requiresKey) {
      setApiKey(selectedId, key);
    }
    setSelectedModel(model);
    if (p.supportsCustomBaseUrl) {
      setCustomBaseUrl(baseUrl);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    clearApiKey(selectedId);
    setKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!open) return null;

  const showKeyField = currentProvider.requiresKey;
  const showBaseUrl = !!currentProvider.supportsCustomBaseUrl;
  const isAnyModel = ANY_MODEL_IDS.has(currentProvider.id);
  const showCorsWarning = currentProvider.browserCors !== "ok";

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
          backgroundColor: "var(--aq-surface)",
          border: "1px solid var(--aq-border)",
          borderRadius: "8px",
          padding: "1.5rem",
          maxWidth: "520px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          direction: "rtl",
        }}
      >
        <h3
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--aq-accent)",
            margin: 0,
            marginBlockEnd: "1rem",
          }}
        >
          ⚙️ الإعدادات
        </h3>

        {/* ---- Provider picker ---- */}
        <SectionLabel>المزوّد</SectionLabel>

        {/* Cloud group */}
        <GroupLabel>مزوّدات سحابية</GroupLabel>
        <ProviderGrid>
          {CLOUD_PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              selected={selectedId === p.id}
              onClick={() => handleProviderChange(p.id)}
            />
          ))}
        </ProviderGrid>

        {/* Local group */}
        <GroupLabel>مزوّدات محلية</GroupLabel>
        <ProviderGrid>
          {ALL_LOCAL.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              selected={selectedId === p.id}
              onClick={() => handleProviderChange(p.id)}
            />
          ))}
        </ProviderGrid>

        {/* ---- Model ---- */}
        <SectionLabel>النموذج</SectionLabel>
        {isAnyModel ? (
          <>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={selectStyle}
            >
              {currentProvider.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="أدخل اسم النموذج..."
              style={{ ...inputStyle, marginBlockStart: "0.375rem" }}
            />
          </>
        ) : (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={selectStyle}
          >
            {currentProvider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

        {/* ---- Base URL ---- */}
        {showBaseUrl && (
          <>
            <SectionLabel>رابط API الأساسي</SectionLabel>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={currentProvider.baseUrl}
              style={{ ...inputStyle, direction: "ltr" }}
            />
          </>
        )}

        {/* ---- API Key ---- */}
        {showKeyField && (
          <>
            <SectionLabel>مفتاح API</SectionLabel>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              style={{ ...inputStyle, direction: "ltr", fontFamily: "monospace" }}
            />
          </>
        )}

        {/* ---- Image provider ---- */}
        <div
          style={{
            marginBlockStart: "1.5rem",
            paddingBlockStart: "1rem",
            borderBlockStart: "1px solid var(--aq-surface-hi)",
          }}
        >
          <SectionLabel>🖼️ مزوّد الصور</SectionLabel>
          <div style={{ fontSize: "0.75rem", color: "var(--aq-muted)", marginBlockEnd: "0.5rem" }}>
            منفصل عن مزوّد النصوص. الكتابة بديب سيك والرسم بتوجيذر هو الإعداد المتوقّع.
          </div>

          <ProviderGrid>
            {IMAGE_PROVIDERS.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                selected={imageProvId === p.id}
                onClick={() => {
                  setImageProviderId(p.id);
                  setImageProvId(p.id);
                  setImageKey(getApiKey(p.id) ?? "");
                  setImageSaved(false);
                }}
              />
            ))}
          </ProviderGrid>

          {IMAGE_PROVIDERS.find((p) => p.id === imageProvId)?.requiresKey && (
            <>
              <SectionLabel>مفتاح API للصور</SectionLabel>
              <input
                type="password"
                value={imageKey}
                onChange={(e) => setImageKey(e.target.value)}
                placeholder="sk-..."
                style={{ ...inputStyle, direction: "ltr", fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", gap: "0.5rem", marginBlockStart: "0.5rem" }}>
                <button
                  onClick={() => {
                    const prov = IMAGE_PROVIDERS.find((p) => p.id === imageProvId);
                    if (prov) {
                      setApiKey(prov.id, imageKey);
                      setImageSaved(true);
                      setTimeout(() => setImageSaved(false), 2000);
                    }
                  }}
                  style={saveBtnStyle}
                >
                  حفظ مفتاح الصور
                </button>
                <button
                  onClick={() => {
                    const prov = IMAGE_PROVIDERS.find((p) => p.id === imageProvId);
                    if (prov) {
                      clearApiKey(prov.id);
                      setImageKey("");
                      setImageSaved(true);
                      setTimeout(() => setImageSaved(false), 2000);
                    }
                  }}
                  style={clearBtnStyle}
                >
                  مسح
                </button>
                {imageSaved && (
                  <span
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--aq-success)",
                      alignSelf: "center",
                    }}
                  >
                    ✓ حُفظ
                  </span>
                )}
              </div>
            </>
          )}

          {!IMAGE_PROVIDERS.find((p) => p.id === imageProvId)?.requiresKey && (
            <div style={{ ...noteStyle, marginBlockStart: "0.5rem" }}>
              💡 هذا المزوّد لا يحتاج مفتاح API لتوليد الصور.
            </div>
          )}
        </div>

        {/* ---- Editor theme ---- */}
        <EditorThemeToggle />

        {/* ---- Quality Linter toggle ---- */}
        <LinterToggle />

        {/* ---- Storage note ---- */}
        <div style={noteStyle}>
          💡 يُخزَّن المفتاح في هذا المتصفح فقط، ولا يُرسل إلا إلى المزوّد الذي
          تختاره. لا يُحفَظ في الخادم ولا يُضمَّن في الملفات المصدرّة.
        </div>

        {/* ---- CORS warning ---- */}
        {showCorsWarning && currentProvider.corsNoteAr && (
          <div style={warningStyle}>⚠️ {currentProvider.corsNoteAr}</div>
        )}

        {/* ---- Provider info ---- */}
        <div style={infoBoxStyle}>
          <InfoRow label="السعر">{currentProvider.pricingInfoAr}</InfoRow>
          {currentProvider.keyAcquisitionUrl && (
            <InfoRow label="الحصول على مفتاح">
              <a
                href={currentProvider.keyAcquisitionUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--aq-accent-muted)", textDecoration: "underline" }}
              >
                {currentProvider.keyAcquisitionUrl}
              </a>
            </InfoRow>
          )}
          <div
            style={{
              marginBlockStart: "0.5rem",
              fontSize: "0.75rem",
              color: "var(--aq-muted)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {currentProvider.instructionsAr}
          </div>
        </div>

        {/* ---- Buttons ---- */}
        {/* ---- Feedback links ---- */}
        <div
          style={{
            marginBlockStart: "1.5rem",
            paddingBlockStart: "1rem",
            borderBlockStart: "1px solid var(--aq-surface-hi)",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            justifyContent: "center",
          }}
        >
          <a
            href="https://github.com/humammalhas/aqlamna/issues/new?template=bug.yml"
            target="_blank"
            rel="noopener"
            style={{ fontSize: "0.8125rem", color: "var(--aq-muted)", textDecoration: "none" }}
          >
            أبلغ عن خطأ
          </a>
          <a
            href="https://github.com/humammalhas/aqlamna/issues/new?template=idea.yml"
            target="_blank"
            rel="noopener"
            style={{ fontSize: "0.8125rem", color: "var(--aq-muted)", textDecoration: "none" }}
          >
            اقترح فكرة
          </a>
          <a
            href="https://github.com/humammalhas/aqlamna/discussions"
            target="_blank"
            rel="noopener"
            style={{ fontSize: "0.8125rem", color: "var(--aq-muted)", textDecoration: "none" }}
          >
            ناقش
          </a>
          <a
            href="mailto:admin@almaseer.co"
            style={{ fontSize: "0.8125rem", color: "var(--aq-muted)", textDecoration: "none" }}
          >
            راسلنا
          </a>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginBlockStart: "1rem" }}>
          {saved && (
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--aq-success)",
                alignSelf: "center",
                marginInlineEnd: "auto",
              }}
            >
              ✓ حُفظ
            </span>
          )}
          {showKeyField && (
            <button onClick={handleClear} style={clearBtnStyle}>
              مسح المفتاح
            </button>
          )}
          <button onClick={handleSave} style={saveBtnStyle}>
            حفظ
          </button>
          <button onClick={onClose} style={closeBtnStyle}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components --------------------------------------------------------

function ProviderCard({
  provider,
  selected,
  onClick,
}: {
  provider: ProviderConfig;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={provider.instructionsAr.split("\n")[0]}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.375rem",
        paddingBlock: "0.5rem",
        paddingInline: "0.625rem",
        fontSize: "0.8125rem",
        fontFamily: "inherit",
        color: selected ? "var(--aq-editor-bg)" : "var(--aq-accent-muted)",
        background: selected ? "var(--aq-accent)" : "var(--aq-surface-hi)",
        border: selected ? "none" : "1px solid var(--aq-border)",
        borderRadius: "6px",
        cursor: "pointer",
        textAlign: "start",
        lineHeight: 1.3,
      }}
    >
      <span style={{ flex: 1 }}>{provider.nameAr}</span>
      {provider.hasFreeTier && (
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 700,
            color: selected ? "var(--aq-editor-bg)" : "var(--aq-success)",
            background: selected ? "rgba(0,0,0,0.1)" : "var(--aq-node-green-bg)",
            paddingBlock: "0.125rem",
            paddingInline: "0.375rem",
            borderRadius: "3px",
          }}
        >
          مجاني
        </span>
      )}
    </button>
  );
}

function ProviderGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: "0.375rem",
        marginBlockEnd: "0.75rem",
      }}
    >
      {children}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.6875rem",
        fontWeight: 600,
        color: "var(--aq-dim)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBlockEnd: "0.375rem",
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "0.8125rem",
        color: "var(--aq-muted)",
        marginBlockEnd: "0.375rem",
        marginBlockStart: "0.5rem",
      }}
    >
      {children}
    </label>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "0.75rem",
        marginBlockEnd: "0.25rem",
      }}
    >
      <span style={{ color: "var(--aq-dim)" }}>{label}</span>
      <span style={{ color: "var(--aq-muted)" }}>{children}</span>
    </div>
  );
}

// ---- Linter Toggle ---------------------------------------------------------

function LinterToggle() {
  const qualityLintEnabled = useStore((s) => s.qualityLintEnabled);
  const toggleQualityLint = useStore((s) => s.toggleQualityLint);

  let metaText: React.ReactNode = null;
  try {
    const meta = getRulesMeta();
    const dateStr = new Date(meta.lastModified).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    metaText = /* @__PURE__ */ (
      <span style={{ color: "var(--aq-dim)" }}>
        {meta.totalActive} قاعدة نشطة · آخر تحديث: {dateStr}
      </span>
    );
  } catch {
    metaText = null;
  }

  return /* @__PURE__ */ (
    <div style={infoBoxStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: "0.875rem", color: "var(--aq-dim)" }}>
            مدقّق الجودة العربية
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--aq-muted)", marginBlockStart: "0.25rem" }}>
            يُظهر تنبيهات على الأنماط غير الفصيحة حسب قواعد ARABIC_MASTERY.md
            {metaText && (
              <>
                <br />
                {metaText}
              </>
            )}
          </div>
        </div>
        <button
          onClick={toggleQualityLint}
          style={{
            paddingBlock: "0.375rem",
            paddingInline: "0.75rem",
            fontSize: "0.8125rem",
            fontFamily: "inherit",
            fontWeight: 600,
            color: qualityLintEnabled ? "var(--aq-editor-bg)" : "var(--aq-muted)",
            background: qualityLintEnabled ? "var(--aq-accent)" : "var(--aq-surface-hi)",
            border: qualityLintEnabled ? "none" : "1px solid var(--aq-border)",
            borderRadius: "6px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {qualityLintEnabled ? "مُفعَّل" : "معطَّل"}
        </button>
      </div>
    </div>
  );
}

function EditorThemeToggle() {
  const editorTheme = useStore((s) => s.editorTheme);
  const toggleEditorTheme = useStore((s) => s.toggleEditorTheme);

  return (
    <div style={infoBoxStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.875rem", color: "var(--aq-accent-muted)" }}>🎨 مظهر المحرر</span>
        <button onClick={toggleEditorTheme} style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", fontFamily: "inherit", fontWeight: 600, color: editorTheme === "light" ? "var(--aq-editor-bg)" : "var(--aq-muted)", background: editorTheme === "light" ? "var(--aq-accent)" : "var(--aq-surface-hi)", border: editorTheme === "light" ? "none" : "1px solid var(--aq-border)", borderRadius: "6px", cursor: "pointer" }}>
          {editorTheme === "light" ? "فاتح" : "غامق"}
        </button>
      </div>
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------------

function getProviderSafe(id: string): ProviderConfig {
  return ALL_PROVIDERS.find((p) => p.id === id) ?? ALL_PROVIDERS[0]!;
}

// ---- Shared styles ---------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%",
  paddingBlock: "0.5rem",
  paddingInline: "0.75rem",
  fontSize: "0.9375rem",
  backgroundColor: "var(--aq-input-bg)",
  color: "var(--aq-text)",
  border: "1px solid var(--aq-border)",
  borderRadius: "6px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  direction: "ltr",
  appearance: "auto",
};

const noteStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--aq-dim)",
  lineHeight: 1.6,
  marginBlockStart: "0.75rem",
  marginBlockEnd: "0.5rem",
};

const warningStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--aq-warning)",
  lineHeight: 1.6,
  marginBlockEnd: "0.5rem",
  padding: "0.5rem",
  background: "var(--aq-warning-bg)",
  borderRadius: "4px",
};

const infoBoxStyle: React.CSSProperties = {
  marginBlockStart: "0.5rem",
  padding: "0.75rem",
  background: "var(--aq-editor-bg)",
  border: "1px solid var(--aq-surface-hi)",
  borderRadius: "6px",
};

const saveBtnStyle: React.CSSProperties = {
  paddingBlock: "0.375rem",
  paddingInline: "0.75rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
  fontFamily: "inherit",
  color: "var(--aq-editor-bg)",
  background: "var(--aq-accent)",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
};

const clearBtnStyle: React.CSSProperties = {
  paddingBlock: "0.375rem",
  paddingInline: "0.75rem",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
  color: "var(--aq-danger)",
  background: "transparent",
  border: "1px solid var(--aq-btn-danger-border)",
  borderRadius: "6px",
  cursor: "pointer",
};

const closeBtnStyle: React.CSSProperties = {
  paddingBlock: "0.375rem",
  paddingInline: "0.75rem",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
  color: "var(--aq-muted)",
  background: "var(--aq-surface-hi)",
  border: "1px solid var(--aq-border)",
  borderRadius: "6px",
  cursor: "pointer",
};

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
import { listServerModels } from "../lib/transport.js";
import { BUILD_ID, forceFreshCopy } from "../lib/build-id.js";
import { getRulesMeta } from "@aqlamna/linter";
import { useStore } from "../store.js";

// Providers where the model field accepts any free-text ID. The two local
// servers belong here: their model list is whatever the author pulled onto
// their own machine, not anything this file can know.
const ANY_MODEL_IDS = new Set(["openrouter", "lmstudio", "ollama"]);

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
  // Models the running local server reports. Empty until it answers, and
  // empty forever if it never does — the static list is the fallback.
  const [serverModels, setServerModels] = useState<string[]>([]);

  // Image provider state (independent from text provider)
  const [imageProvId, setImageProvId] = useState(getImageProviderId());
  const [imageKey, setImageKey] = useState(getImageApiKey() ?? "");
  const [imageSaved, setImageSaved] = useState(false);

  // Load current values when modal opens or provider changes
  useEffect(() => {
    if (!open) return;
    setSelectedId(getSelectedProviderId());
  }, [open]);

  // Escape closes it. It used to close ONLY on the ✕ or on hitting the exact
  // strip of backdrop around the card — and its full-viewport backdrop swallows
  // every click behind it, so a reader who pressed Escape and then reached for
  // ⚙️ again was clicking a button that could not be clicked, with nothing on
  // screen saying why. The ❓ and ☰ menus in TopBar have closed on Escape all
  // along; this is the one modal that did not.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const currentProvider = getProviderSafe(selectedId);

  useEffect(() => {
    setKey(getApiKey(selectedId) ?? "");
    // Per-provider, and the provider's own default when nothing valid is
    // stored for it. Reading a global slot here is what sent a Google model
    // ID to Anthropic.
    setModel(getSelectedModel(selectedId) || currentProvider.defaultModel);
    setBaseUrl(
      getCustomBaseUrl() ||
        (currentProvider.supportsCustomBaseUrl ? currentProvider.baseUrl : ""),
    );
    setSaved(false);
    setServerModels([]);
  }, [selectedId, currentProvider]);

  // Ask a local server what it actually has. Fire-and-forget: a server that is
  // not running must not stall or break the panel, so a failure just leaves
  // the static list in place.
  useEffect(() => {
    if (!open || !currentProvider.isLocal) return;
    let cancelled = false;
    const url = getCustomBaseUrl() || currentProvider.baseUrl;
    listServerModels(url, getApiKey(selectedId) ?? undefined).then((models) => {
      if (cancelled || models.length === 0) return;
      setServerModels(models);
      // A model the server does not have is a 404 the author has no way to
      // predict. If what is selected isn't there, move to something that is.
      setModel((current) => (models.includes(current) ? current : models[0]!));
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, currentProvider]);

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
    setSelectedModel(selectedId, model);
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
  // What the server said, when it said anything; the registry's guess otherwise.
  const modelOptions =
    serverModels.length > 0 ? serverModels : currentProvider.models;

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
            {modelOptions.map((m) => (
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

        {/* ---- Which authoring surface قصتك shows ---- */}
        <WriterModeToggle />

        {/* ---- Editor theme ---- */}
        <EditorThemeToggle />

        {/* ---- Quality Linter toggle ---- */}
        <LinterToggle />

        {/* ---- Storage note ---- */}
        <div style={noteStyle}>
          💡 يُخزَّن المفتاح في هذا المتصفح فقط، ولا يُرسل إلا إلى المزوّد الذي
          تختاره. لا يُحفَظ في الخادم ولا يُضمَّن في الملفات المصدرّة.
        </div>

        {/* ---- Local providers do not work on the deployed site ---- */}
        {currentProvider.isLocal && (
          <div style={warningStyle}>
            ⚠️ هذا المزوّد يعمل فقط حين تشغّل المحرّر على جهازك. الموقع المنشور
            يُقدَّم عبر https، والمتصفّح يمنع أيّ اتصال بـ http://localhost من
            صفحة https — فلن يستجيب هنا مهما كانت الإعدادات.
          </div>
        )}

        {/* ---- CORS warning ---- */}
        {showCorsWarning && currentProvider.corsNoteAr && (
          <div style={warningStyle}>⚠️ {currentProvider.corsNoteAr}</div>
        )}

        {/* ---- Provider info ---- */}
        <div style={infoBoxStyle}>
          <InfoRow label="التشغيل">{currentProvider.pricingInfoAr}</InfoRow>
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

        {/* ---- Version, and the way out of a stale one ----
            A hard refresh does not clear a service worker's cache, so an author
            can sit on a months-old editor while the site has moved on — pasting
            a valid key into a build whose model IDs were retired. This button
            unregisters the worker, deletes every cache and reloads. The build id
            is here so "which version am I on?" has an answer on screen. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            flexWrap: "wrap",
            marginBlockStart: "1rem",
            paddingBlockStart: "0.875rem",
            borderBlockStart: "1px solid var(--aq-border)",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--aq-muted)" }}>
            النسخة: <code data-build-id={BUILD_ID}>{BUILD_ID}</code>
          </span>
          <button
            onClick={() => { void forceFreshCopy(); }}
            title="يمسح النسخة المخزَّنة في المتصفّح ويحمّل أحدث نسخة من الموقع"
            style={{
              minBlockSize: "44px",
              paddingBlock: "0.375rem",
              paddingInline: "0.75rem",
              fontSize: "0.8125rem",
              fontFamily: "inherit",
              color: "var(--aq-accent)",
              background: "var(--aq-surface-hi)",
              border: "1px solid var(--aq-border-hi)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            ↻ حدّث النسخة
          </button>
          <span style={{ fontSize: "0.75rem", color: "var(--aq-dim)", flex: "1 1 12rem", minInlineSize: 0 }}>
            إن بقي المحرر على نسخة قديمة رغم التحديث، اضغط هنا. قصتك محفوظة ولا يمسحها هذا الزر.
          </span>
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
      {/* This used to be a "مجاني" badge. Prices change, badges do not — and
          these two providers do not work on the deployed site at all, which is
          the thing a writer actually needs to know before picking one. */}
      {provider.isLocal && (
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 700,
            color: selected ? "var(--aq-editor-bg)" : "var(--aq-muted)",
            background: selected ? "rgba(0,0,0,0.1)" : "var(--aq-surface-hi)",
            paddingBlock: "0.125rem",
            paddingInline: "0.375rem",
            borderRadius: "3px",
          }}
        >
          محليّ
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

// ---- Writer mode -----------------------------------------------------------

/**
 * Visual writer or CodeMirror.
 *
 * Switching to متقدّم is safe in both directions: the visual writer's own
 * output IS the source the code editor shows, and coming back re-reads it. What
 * cannot come back is a story that grew features the form has no field for —
 * the pane says so by name rather than dropping them, so the door is one-way
 * only for the parts of the language the writer never had.
 */
function WriterModeToggle() {
  const writerMode = useStore((s) => s.writerMode);
  const setWriterMode = useStore((s) => s.setWriterMode);
  const advanced = writerMode === "code";

  return (
    <div style={infoBoxStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
        <div>
          <div style={{ fontSize: "0.875rem", color: "var(--aq-dim)" }}>وضع المحرّر</div>
          <div style={{ fontSize: "0.75rem", color: "var(--aq-muted)", marginBlockStart: "0.25rem" }}>
            {advanced
              ? "المحرّر النصّي: لغة أقلام كاملة، بكلّ ما فيها."
              : "المحرّر المرئي: بطاقات وحقول، دون أيّ رموز."}
          </div>
        </div>
        <button
          data-writer-mode-toggle={writerMode}
          onClick={() => setWriterMode(advanced ? "visual" : "code")}
          title={advanced ? "العودة إلى البطاقات والحقول" : "إظهار لغة أقلامنا"}
          style={{
            paddingBlock: "0.375rem",
            paddingInline: "0.75rem",
            fontSize: "0.8125rem",
            fontFamily: "inherit",
            fontWeight: 600,
            color: advanced ? "var(--aq-editor-bg)" : "var(--aq-muted)",
            background: advanced ? "var(--aq-accent)" : "var(--aq-surface-hi)",
            border: advanced ? "none" : "1px solid var(--aq-border)",
            borderRadius: "6px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {advanced ? "متقدّم" : "مرئي"}
        </button>
      </div>

      {/* The two language references live here, and only here: beside the
          switch that turns the language on. They were in the ❓ menu, where the
          reader is a beginner and the answer to every question is a field, not
          a keyword. */}
      {advanced && (
        <div style={{ ...noteStyle, marginBlockStart: "0.625rem", marginBlockEnd: 0 }}>
          <a
            href="/docs/المرجع.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--aq-accent-muted)", textDecoration: "underline" }}
          >
            📚 المرجع — دليل اللغة
          </a>
          {" · "}
          <a
            href="/docs/الأخطاء.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--aq-accent-muted)", textDecoration: "underline" }}
          >
            ⚠️ رموز الخطأ
          </a>
        </div>
      )}
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

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
} from "../lib/ai-keys.js";
import {
  ALL_PROVIDERS,
  ALL_LOCAL,
  type ProviderConfig,
} from "../lib/providers.js";

// Providers where the model field accepts any free-text ID.
const ANY_MODEL_IDS = new Set(["openrouter", "lmstudio", "custom"]);

// Cloud providers: everything that is NOT local.
const CLOUD_PROVIDERS = ALL_PROVIDERS.filter((p) => !ALL_LOCAL.includes(p));

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
          backgroundColor: "#1c1917",
          border: "1px solid #3a3528",
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
            color: "#d4a843",
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
                style={{ color: "#b09050", textDecoration: "underline" }}
              >
                {currentProvider.keyAcquisitionUrl}
              </a>
            </InfoRow>
          )}
          <div
            style={{
              marginBlockStart: "0.5rem",
              fontSize: "0.75rem",
              color: "#8a8070",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {currentProvider.instructionsAr}
          </div>
        </div>

        {/* ---- Buttons ---- */}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginBlockStart: "1rem" }}>
          {saved && (
            <span
              style={{
                fontSize: "0.8125rem",
                color: "#60b060",
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
        color: selected ? "#141210" : "#c0b090",
        background: selected ? "#d4a843" : "#2a2620",
        border: selected ? "none" : "1px solid #3a3528",
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
            color: selected ? "#141210" : "#60b060",
            background: selected ? "rgba(0,0,0,0.1)" : "#1a3a1a",
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
        color: "#6a6450",
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
        color: "#8a8070",
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
      <span style={{ color: "#6a6450" }}>{label}</span>
      <span style={{ color: "#9a8c70" }}>{children}</span>
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
  backgroundColor: "#0e0d0b",
  color: "#e0d6c2",
  border: "1px solid #3a3528",
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
  color: "#6a6450",
  lineHeight: 1.6,
  marginBlockStart: "0.75rem",
  marginBlockEnd: "0.5rem",
};

const warningStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#c09050",
  lineHeight: 1.6,
  marginBlockEnd: "0.5rem",
  padding: "0.5rem",
  background: "#2a2010",
  borderRadius: "4px",
};

const infoBoxStyle: React.CSSProperties = {
  marginBlockStart: "0.5rem",
  padding: "0.75rem",
  background: "#141210",
  border: "1px solid #2a2620",
  borderRadius: "6px",
};

const saveBtnStyle: React.CSSProperties = {
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
};

const clearBtnStyle: React.CSSProperties = {
  paddingBlock: "0.375rem",
  paddingInline: "0.75rem",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
  color: "#c06050",
  background: "transparent",
  border: "1px solid #4a3030",
  borderRadius: "6px",
  cursor: "pointer",
};

const closeBtnStyle: React.CSSProperties = {
  paddingBlock: "0.375rem",
  paddingInline: "0.75rem",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
  color: "#8a8070",
  background: "#2a2620",
  border: "1px solid #3a3528",
  borderRadius: "6px",
  cursor: "pointer",
};

/**
 * Provider registry — ported faithfully from Maskan's ProviderConfigs.kt
 * (github.com/humammalhas/maskan). Same 12 providers, same models, same
 * key-acquisition instructions in Arabic and English.
 *
 * ONE DIFFERENCE FROM MASKAN, and it matters:
 * Maskan is an Android app and can call any API. Aqlamna runs in a browser, which
 * enforces CORS. Some providers do not send the headers a browser needs, so a
 * direct call fails no matter how correct the code is. `browserCors` records what
 * we know; the UI must warn honestly rather than fail silently.
 *
 * This file is DATA. Do not add transport logic here.
 */

export type ProviderKind = "openai-compatible" | "anthropic" | "gemini";

/** How well a provider works when called directly from a browser page. */
export type BrowserCors =
  /** Documented/known to allow direct browser calls. */
  | "ok"
  /** Works only with an extra opt-in header. */
  | "needs-header"
  /** Local server — works once the user allows the origin. */
  | "local"
  /** Unverified: may be blocked by CORS. Must be surfaced to the user. */
  | "unknown";

export interface ProviderConfig {
  id: string;
  displayName: string;
  nameAr: string;
  kind: ProviderKind;
  baseUrl: string;
  supportsCustomBaseUrl?: boolean;
  isLocal?: boolean;
  /** Local providers need no key. */
  requiresKey: boolean;
  models: string[];
  defaultModel: string;
  keyAcquisitionUrl: string;
  pricingInfo: string;
  pricingInfoAr: string;
  /** Free to use at all, in some form — drives the "مجاني" badge. */
  hasFreeTier: boolean;
  browserCors: BrowserCors;
  /** Shown when browserCors is not "ok" — explain the limitation in Arabic. */
  corsNoteAr?: string;
  instructionsEn: string;
  instructionsAr: string;
  /** Whether this provider can generate images. */
  supportsImages: boolean;
  /** Model ID for image generation, or null if unsupported. */
  imageModel: string | null;
}

export const DEEPSEEK: ProviderConfig = {
  id: "deepseek",
  displayName: "DeepSeek",
  nameAr: "ديب سيك",
  kind: "openai-compatible",
  baseUrl: "https://api.deepseek.com/",
  requiresKey: true,
  models: ["deepseek-chat", "deepseek-reasoner"],
  defaultModel: "deepseek-chat",
  keyAcquisitionUrl: "https://platform.deepseek.com",
  pricingInfo: "Pay-as-you-go",
  pricingInfoAr: "الدفع حسب الاستخدام",
  hasFreeTier: false,
  browserCors: "unknown",
  corsNoteAr: "قد يمنع المزوّد الطلبات المباشرة من المتصفح. إن فشل الاتصال، استخدم أوبن راوتر أو أولاما.",
  instructionsEn:
    "Go to platform.deepseek.com and sign up or log in.\nNavigate to the \"API Keys\" section.\nCreate a new API key and copy it.\nPaste the key above — it is stored in this browser only.",
  instructionsAr:
    "اذهب إلى platform.deepseek.com وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى قسم \"API Keys\".\nأنشئ مفتاح API جديداً وانسخه.\nالصق المفتاح أعلاه — يُخزَّن في هذا المتصفح فقط.",
  supportsImages: false,
  imageModel: null,
};

export const OPENAI: ProviderConfig = {
  id: "openai",
  displayName: "OpenAI",
  nameAr: "أوبن إيه آي",
  kind: "openai-compatible",
  baseUrl: "https://api.openai.com/",
  requiresKey: true,
  models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
  defaultModel: "gpt-4.1-mini",
  keyAcquisitionUrl: "https://platform.openai.com/api-keys",
  pricingInfo: "Pay-as-you-go",
  pricingInfoAr: "الدفع حسب الاستخدام",
  hasFreeTier: false,
  browserCors: "unknown",
  corsNoteAr: "قد يمنع المزوّد الطلبات المباشرة من المتصفح. إن فشل الاتصال، استخدم أوبن راوتر أو أولاما.",
  instructionsEn:
    "Go to platform.openai.com and sign up or log in.\nNavigate to \"API Keys\" in the dashboard.\nCreate a new secret key and copy it.\nPaste the key above — it is stored in this browser only.",
  instructionsAr:
    "اذهب إلى platform.openai.com وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى \"API Keys\" في لوحة التحكم.\nأنشئ مفتاح سري جديداً وانسخه.\nالصق المفتاح أعلاه — يُخزَّن في هذا المتصفح فقط.",
  supportsImages: true,
  imageModel: "gpt-image-1",
};

export const GROQ: ProviderConfig = {
  id: "groq",
  displayName: "Groq",
  nameAr: "جروك",
  kind: "openai-compatible",
  baseUrl: "https://api.groq.com/openai/",
  requiresKey: true,
  models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen-3-32b"],
  defaultModel: "llama-3.3-70b-versatile",
  keyAcquisitionUrl: "https://console.groq.com/keys",
  pricingInfo: "Pay-as-you-go",
  pricingInfoAr: "الدفع حسب الاستخدام",
  hasFreeTier: false,
  browserCors: "unknown",
  corsNoteAr: "قد يمنع المزوّد الطلبات المباشرة من المتصفح. إن فشل الاتصال، استخدم أوبن راوتر أو أولاما.",
  instructionsEn:
    "Go to console.groq.com and sign up or log in.\nNavigate to \"API Keys\".\nCreate a new API key and copy it.\nPaste the key above — it is stored in this browser only.",
  instructionsAr:
    "اذهب إلى console.groq.com وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى \"API Keys\".\nأنشئ مفتاح API جديداً وانسخه.\nالصق المفتاح أعلاه — يُخزَّن في هذا المتصفح فقط.",
  supportsImages: false,
  imageModel: null,
};

export const TOGETHER: ProviderConfig = {
  id: "together",
  displayName: "Together AI",
  nameAr: "توجيذر",
  kind: "openai-compatible",
  baseUrl: "https://api.together.xyz/",
  requiresKey: true,
  models: [
    "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "meta-llama/Llama-3.1-8B-Instruct-Turbo",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
  ],
  defaultModel: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  keyAcquisitionUrl: "https://api.together.ai/settings/api-keys",
  pricingInfo: "Pay-as-you-go, cheap inference",
  pricingInfoAr: "الدفع حسب الاستخدام، أسعار منخفضة",
  hasFreeTier: false,
  browserCors: "unknown",
  corsNoteAr: "قد يمنع المزوّد الطلبات المباشرة من المتصفح. إن فشل الاتصال، استخدم أوبن راوتر أو أولاما.",
  instructionsEn:
    "Go to api.together.ai and sign up or log in.\nNavigate to Settings → API Keys.\nCreate a new API key and copy it.\nTogether AI offers affordable inference for open-source models.",
  instructionsAr:
    "اذهب إلى api.together.ai وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى الإعدادات → API Keys.\nأنشئ مفتاح API جديداً وانسخه.\nتوجيذر يوفر استدلالاً بأسعار معقولة للنماذج مفتوحة المصدر.",
  supportsImages: true,
  imageModel: "black-forest-labs/FLUX.1-schnell",
};

export const MISTRAL: ProviderConfig = {
  id: "mistral",
  displayName: "Mistral AI",
  nameAr: "ميسترال",
  kind: "openai-compatible",
  baseUrl: "https://api.mistral.ai/",
  requiresKey: true,
  models: ["mistral-large-latest", "open-mistral-nemo", "mistral-small-latest", "codestral-latest"],
  defaultModel: "mistral-small-latest",
  keyAcquisitionUrl: "https://console.mistral.ai/api-keys/",
  pricingInfo: "Pay-as-you-go, EU-based",
  pricingInfoAr: "الدفع حسب الاستخدام، مقرّه أوروبا",
  hasFreeTier: false,
  browserCors: "unknown",
  corsNoteAr: "قد يمنع المزوّد الطلبات المباشرة من المتصفح. إن فشل الاتصال، استخدم أوبن راوتر أو أولاما.",
  instructionsEn:
    "Go to console.mistral.ai and sign up or log in.\nNavigate to \"API Keys\".\nCreate a new API key and copy it.\nMistral is EU-based and GDPR-friendly.",
  instructionsAr:
    "اذهب إلى console.mistral.ai وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى \"API Keys\".\nأنشئ مفتاح API جديداً وانسخه.\nميسترال شركة أوروبية ومتوافقة مع GDPR.",
  supportsImages: false,
  imageModel: null,
};

export const VENICE: ProviderConfig = {
  id: "venice",
  displayName: "Venice AI",
  nameAr: "فينيس",
  kind: "openai-compatible",
  baseUrl: "https://api.venice.ai/api/",
  requiresKey: true,
  models: [
    "venice-uncensored-1-2",
    "llama-3.3-70b",
    "qwen3-235b-a22b-instruct-2507",
    "deepseek-v3.2",
    "google-gemma-4-31b-it",
  ],
  defaultModel: "llama-3.3-70b",
  keyAcquisitionUrl: "https://venice.ai/settings/api",
  pricingInfo: "Credit-based",
  pricingInfoAr: "نظام رصيد",
  hasFreeTier: false,
  browserCors: "unknown",
  corsNoteAr: "قد يمنع المزوّد الطلبات المباشرة من المتصفح. إن فشل الاتصال، استخدم أوبن راوتر أو أولاما.",
  instructionsEn:
    "Go to venice.ai and sign up or log in.\nNavigate to Settings → API.\nCreate a new API key and copy it.\nVenice is a privacy-focused provider with zero-retention policies.",
  instructionsAr:
    "اذهب إلى venice.ai وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى الإعدادات → API.\nأنشئ مفتاح API جديداً وانسخه.\nفينيس مزوّد يركّز على الخصوصية مع سياسة عدم الاحتفاظ بالبيانات.",
  supportsImages: false,
  imageModel: null,
};

export const OPENROUTER: ProviderConfig = {
  id: "openrouter",
  displayName: "OpenRouter",
  nameAr: "أوبن راوتر",
  kind: "openai-compatible",
  baseUrl: "https://openrouter.ai/api/",
  requiresKey: true,
  models: ["auto"],
  defaultModel: "auto",
  keyAcquisitionUrl: "https://openrouter.ai/keys",
  pricingInfo: "Gateway to 100+ models",
  pricingInfoAr: "بوابة لأكثر من 100 نموذج",
  hasFreeTier: false,
  browserCors: "ok",
  instructionsEn:
    "Go to openrouter.ai and sign up or log in.\nNavigate to \"Keys\" in the dashboard.\nCreate a new API key and copy it.\nOpenRouter gives you access to 100+ models with one key, and works reliably from the browser.\nYou can type any model ID manually (e.g. anthropic/claude-3.5-sonnet).",
  instructionsAr:
    "اذهب إلى openrouter.ai وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى \"Keys\" في لوحة التحكم.\nأنشئ مفتاح API جديداً وانسخه.\nأوبن راوتر يتيح الوصول لأكثر من 100 نموذج بمفتاح واحد، ويعمل من المتصفح بلا مشاكل.\nيمكنك كتابة معرّف أي نموذج يدوياً.",
  supportsImages: false,
  imageModel: null,
};

export const ANTHROPIC: ProviderConfig = {
  id: "anthropic",
  displayName: "Anthropic Claude",
  nameAr: "أنثروبيك كلود",
  kind: "anthropic",
  baseUrl: "https://api.anthropic.com/",
  requiresKey: true,
  models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
  defaultModel: "claude-sonnet-4-6",
  keyAcquisitionUrl: "https://console.anthropic.com/settings/keys",
  pricingInfo: "Pay-as-you-go",
  pricingInfoAr: "الدفع حسب الاستخدام",
  hasFreeTier: false,
  browserCors: "needs-header",
  corsNoteAr: "يتطلب ترويسة إضافية للسماح بالاتصال من المتصفح.",
  instructionsEn:
    "Go to console.anthropic.com and sign up or log in.\nNavigate to Settings → API Keys.\nCreate a new API key and copy it.\nPaste the key above — it is stored in this browser only.",
  instructionsAr:
    "اذهب إلى console.anthropic.com وسجّل الدخول أو أنشئ حساباً.\nانتقل إلى الإعدادات → API Keys.\nأنشئ مفتاح API جديداً وانسخه.\nالصق المفتاح أعلاه — يُخزَّن في هذا المتصفح فقط.",
  supportsImages: false,
  imageModel: null,
};

export const GEMINI: ProviderConfig = {
  id: "gemini",
  displayName: "Google Gemini",
  nameAr: "جوجل جيميناي",
  kind: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com/",
  requiresKey: true,
  models: ["gemini-2.5-flash", "gemini-3-flash", "gemini-3.1-pro"],
  defaultModel: "gemini-2.5-flash",
  keyAcquisitionUrl: "https://aistudio.google.com/apikey",
  pricingInfo: "Pay-as-you-go",
  pricingInfoAr: "الدفع حسب الاستخدام",
  hasFreeTier: false,
  browserCors: "ok",
  instructionsEn:
    "Go to aistudio.google.com and sign in with your Google account.\nClick \"Get API key\" in the top menu.\nCreate a new API key and copy it.\nPaste the key above — it is stored in this browser only.",
  instructionsAr:
    "اذهب إلى aistudio.google.com وسجّل الدخول بحساب جوجل.\nاضغط على \"Get API key\" في القائمة العلوية.\nأنشئ مفتاح API جديداً وانسخه.\nالصق المفتاح أعلاه — يُخزَّن في هذا المتصفح فقط.",
  supportsImages: true,
  imageModel: "gemini-3.1-flash-image-preview",
};

export const OLLAMA: ProviderConfig = {
  id: "ollama",
  displayName: "Ollama (Local)",
  nameAr: "أولاما (محلي)",
  kind: "openai-compatible",
  baseUrl: "http://localhost:11434/",
  supportsCustomBaseUrl: true,
  isLocal: true,
  requiresKey: false,
  models: ["llama3.2", "llama3.1", "mistral", "gemma2", "qwen2.5", "phi3"],
  defaultModel: "llama3.2",
  keyAcquisitionUrl: "https://ollama.com/download",
  pricingInfo: "Free — runs on your computer",
  pricingInfoAr: "مجاني — يعمل على جهازك",
  hasFreeTier: true,
  browserCors: "local",
  corsNoteAr:
    "للسماح للمتصفح بالاتصال، شغّل أولاما مع OLLAMA_ORIGINS=* — مثلاً: OLLAMA_ORIGINS=* ollama serve",
  instructionsEn:
    "Install Ollama from ollama.com/download.\nPull a model: ollama pull llama3.2\nStart it so the browser is allowed to connect:\n  OLLAMA_ORIGINS=* ollama serve\nNo API key needed — leave the key field empty.\nCompletely free and completely private: nothing leaves your computer.",
  instructionsAr:
    "ثبّت أولاما من ollama.com/download.\nحمّل نموذجاً: ollama pull llama3.2\nشغّله بصيغة تسمح للمتصفح بالاتصال:\n  OLLAMA_ORIGINS=* ollama serve\nلا حاجة لمفتاح API — اترك حقل المفتاح فارغاً.\nمجاني تماماً وخاصّ تماماً: لا يخرج شيء من جهازك.",
  supportsImages: false,
  imageModel: null,
};

export const LM_STUDIO: ProviderConfig = {
  id: "lmstudio",
  displayName: "LM Studio (Local)",
  nameAr: "إل إم ستوديو (محلي)",
  kind: "openai-compatible",
  baseUrl: "http://localhost:1234/",
  supportsCustomBaseUrl: true,
  isLocal: true,
  requiresKey: false,
  models: ["local-model"],
  defaultModel: "local-model",
  keyAcquisitionUrl: "https://lmstudio.ai",
  pricingInfo: "Free — runs on your computer",
  pricingInfoAr: "مجاني — يعمل على جهازك",
  hasFreeTier: true,
  browserCors: "local",
  corsNoteAr: "فعّل CORS في إعدادات الخادم المحلي في LM Studio.",
  instructionsEn:
    "Install LM Studio from lmstudio.ai.\nDownload a model and start the local server, with CORS enabled in the server settings.\nNo API key needed — leave the key field empty.\nType your model name in the model field.",
  instructionsAr:
    "ثبّت LM Studio من lmstudio.ai.\nحمّل نموذجاً وشغّل الخادم المحلي، مع تفعيل CORS في إعدادات الخادم.\nلا حاجة لمفتاح API — اترك حقل المفتاح فارغاً.\nاكتب اسم النموذج في حقل النموذج.",
  supportsImages: false,
  imageModel: null,
};

// CUSTOM provider removed — orphaned localStorage key handled by getProviderSafe() fallback


export const ALL_OPENAI_COMPATIBLE: ProviderConfig[] = [
  DEEPSEEK,
  OPENAI,
  GROQ,
  TOGETHER,
  MISTRAL,
  VENICE,
  OPENROUTER,
];

export const ALL_LOCAL: ProviderConfig[] = [OLLAMA, LM_STUDIO];

export const ALL_PROVIDERS: ProviderConfig[] = [
  ...ALL_OPENAI_COMPATIBLE,
  ANTHROPIC,
  GEMINI,
  ...ALL_LOCAL,
];

export function providerById(id: string): ProviderConfig | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

/** Providers that cost nothing to try — surfaced first in the UI. */
export const FREE_PROVIDER_IDS = ALL_PROVIDERS.filter((p) => p.hasFreeTier).map((p) => p.id);

// ---------------------------------------------------------------------------
// AI key management — per-provider keys stored in localStorage only.
// Switching provider preserves the previous provider's key.
//
// Storage keys:
//   aqlamna-provider    — selected provider ID (default: "deepseek")
//   aqlamna-model-{id}  — selected model for provider {id} ("" = provider default)
//   aqlamna-baseurl     — custom base URL ("" means use provider default)
//   aqlamna-key-{id}    — API key for provider {id}
//
// The model used to live in ONE global slot, `aqlamna-model`, shared by all
// eleven providers. Picking a Gemini model and then switching to Anthropic
// therefore sent `gemini-3-flash` to api.anthropic.com, which answered 404 —
// on the live site, to real authors. The key is per-provider now, and a stored
// model that is not one of the selected provider's own models is discarded
// rather than sent. That second half is what makes the legacy global slot safe
// to leave behind in existing browsers: it can no longer resolve for anyone.
//
// In dev, DEEPSEEK_API_KEY is read for the deepseek provider only.
// ---------------------------------------------------------------------------

import { ALL_PROVIDERS, providerById, type ProviderConfig } from "./providers.js";

const KEY_PROVIDER = "aqlamna-provider";
const KEY_MODEL_PREFIX = "aqlamna-model-";
/** Retired: the one global slot. Kept only so `clearAllKeys` can remove it. */
const KEY_MODEL_LEGACY = "aqlamna-model";
const KEY_BASEURL = "aqlamna-baseurl";
const KEY_PREFIX = "aqlamna-key-";

/**
 * Providers whose model field is free text. OpenRouter proxies 100+ models,
 * and the two local servers run whatever the author pulled onto their own
 * machine, so for these three the `models` array is a starting point rather
 * than a closed set — anything the author types is kept as written. The
 * settings panel asks a local server for its real list; validating against the
 * static one would throw away a model the server actually has.
 */
const FREE_TEXT_MODEL_PROVIDERS = new Set(["openrouter", "lmstudio", "ollama"]);

// ---- Per-provider key ------------------------------------------------------

function keyForProvider(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export function getApiKey(providerId: string): string | null {
  const stored = localStorage.getItem(keyForProvider(providerId));
  if (stored && stored.trim().length > 0) return stored.trim();

  // Dev-only fallback for deepseek (import.meta.env stripped in production)
  if (providerId === "deepseek") {
    try {
      if (typeof import.meta !== "undefined" && import.meta.env) {
        const envKey = (import.meta.env as Record<string, string>).VITE_DEEPSEEK_API_KEY;
        if (envKey && envKey.trim().length > 0) return envKey.trim();
      }
    } catch {
      // import.meta.env not available
    }
  }

  return null;
}

export function setApiKey(providerId: string, key: string): string {
  const trimmed = key.trim();
  localStorage.setItem(keyForProvider(providerId), trimmed);
  return trimmed;
}

export function clearApiKey(providerId: string): void {
  localStorage.removeItem(keyForProvider(providerId));
}

// ---- Selected provider -----------------------------------------------------

export function getSelectedProviderId(): string {
  const id = localStorage.getItem(KEY_PROVIDER);
  if (id && providerById(id)) return id;
  return "deepseek";
}

export function setSelectedProviderId(id: string): void {
  if (!providerById(id)) return;
  localStorage.setItem(KEY_PROVIDER, id);
}

export function getSelectedProvider(): ProviderConfig {
  return providerById(getSelectedProviderId())!;
}

// ---- Selected model --------------------------------------------------------

function modelKeyFor(providerId: string): string {
  return `${KEY_MODEL_PREFIX}${providerId}`;
}

/**
 * The model the author chose for one provider, or "" when there is none the
 * provider can actually serve. Defaults to the currently selected provider.
 *
 * A stored model that is not in the provider's own `models` is treated as
 * absent — that is the guard against every way a wrong ID can reach an API:
 * the retired global slot, a model list that shrank under a saved choice, and
 * a hand-edited localStorage entry alike.
 */
export function getSelectedModel(providerId: string = getSelectedProviderId()): string {
  const provider = providerById(providerId);
  if (!provider) return "";

  const stored = localStorage.getItem(modelKeyFor(providerId))?.trim() ?? "";
  if (!stored) return "";

  if (FREE_TEXT_MODEL_PROVIDERS.has(providerId)) return stored;
  return provider.models.includes(stored) ? stored : "";
}

export function setSelectedModel(providerId: string, model: string): void {
  if (!providerById(providerId)) return;
  localStorage.setItem(modelKeyFor(providerId), model.trim());
}

/** Always a model the selected provider can serve. */
export function getEffectiveModel(): string {
  const provider = getSelectedProvider();
  return getSelectedModel(provider.id) || provider.defaultModel;
}

// ---- Custom base URL -------------------------------------------------------

export function getCustomBaseUrl(): string {
  const url = localStorage.getItem(KEY_BASEURL);
  if (url && url.trim().length > 0) return url.trim();
  return "";
}

export function setCustomBaseUrl(url: string): void {
  localStorage.setItem(KEY_BASEURL, url.trim());
}

export function getEffectiveBaseUrl(): string {
  const custom = getCustomBaseUrl();
  if (custom) return custom;
  return getSelectedProvider().baseUrl;
}

// ---- Transport config ------------------------------------------------------

/**
 * Everything the transport needs about the selected provider, in one place.
 *
 * Four call sites used to hand-build `{ baseUrl, model, apiKey }`, which was
 * fine right up until a provider needed a fifth field — then adding one meant
 * remembering four edits, and forgetting one meant a 400 on a code path nobody
 * exercises often. Build it here; the quirks travel with it.
 */
export function getTransportConfig(): {
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxTokensParam?: "max_tokens" | "max_completion_tokens";
  supportsTemperature?: boolean;
} {
  const provider = getSelectedProvider();
  return {
    baseUrl: getEffectiveBaseUrl(),
    model: getEffectiveModel(),
    apiKey: provider.requiresKey ? (getApiKey(provider.id) ?? undefined) : undefined,
    maxTokensParam: provider.maxTokensParam,
    supportsTemperature: provider.supportsTemperature,
  };
}

// ---- Convenience -----------------------------------------------------------

export function hasApiKey(): boolean {
  const provider = getSelectedProvider();
  if (!provider.requiresKey) return true; // local providers need no key
  const key = getApiKey(provider.id);
  return key !== null && key.length > 0;
}

export function clearAllKeys(): void {
  for (const p of ALL_PROVIDERS) {
    localStorage.removeItem(keyForProvider(p.id));
    localStorage.removeItem(modelKeyFor(p.id));
  }
  localStorage.removeItem(KEY_PROVIDER);
  localStorage.removeItem(KEY_MODEL_LEGACY);
  localStorage.removeItem(KEY_BASEURL);
  localStorage.removeItem(KEY_IMAGE_PROVIDER);
}

// ---- Image provider (independent from text provider) -----------------------

const KEY_IMAGE_PROVIDER = "aqlamna-image-provider";

/**
 * Default image provider is Together, whose image model is
 * `black-forest-labs/FLUX.1-schnell`. Say nothing here about what it costs —
 * this comment used to call it free, which was true in 2024 and is not now.
 */
export function getImageProviderId(): string {
  const id = localStorage.getItem(KEY_IMAGE_PROVIDER);
  if (id && providerById(id)?.supportsImages) return id;
  return "together";
}

export function setImageProviderId(id: string): void {
  if (!providerById(id)?.supportsImages) return;
  localStorage.setItem(KEY_IMAGE_PROVIDER, id);
}

export function getImageProvider(): ProviderConfig {
  return providerById(getImageProviderId())!;
}

export function getImageModel(): string {
  return getImageProvider().imageModel!;
}

export function getImageApiKey(): string | null {
  return getApiKey(getImageProviderId());
}

export function hasImageApiKey(): boolean {
  const provider = getImageProvider();
  if (!provider.requiresKey) return true;
  const key = getImageApiKey();
  return key !== null && key.length > 0;
}

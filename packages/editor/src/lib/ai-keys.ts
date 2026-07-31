// ---------------------------------------------------------------------------
// AI key management — per-provider keys stored in localStorage only.
// Switching provider preserves the previous provider's key.
//
// Storage keys:
//   aqlamna-provider    — selected provider ID (default: "deepseek")
//   aqlamna-model       — selected model ID ("" means use provider default)
//   aqlamna-baseurl     — custom base URL ("" means use provider default)
//   aqlamna-key-{id}    — API key for provider {id}
//
// In dev, DEEPSEEK_API_KEY is read for the deepseek provider only.
// ---------------------------------------------------------------------------

import { ALL_PROVIDERS, providerById, type ProviderConfig } from "./providers.js";

const KEY_PROVIDER = "aqlamna-provider";
const KEY_MODEL = "aqlamna-model";
const KEY_BASEURL = "aqlamna-baseurl";
const KEY_PREFIX = "aqlamna-key-";

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

export function getSelectedModel(): string {
  const model = localStorage.getItem(KEY_MODEL);
  if (model && model.trim().length > 0) return model.trim();
  return "";
}

export function setSelectedModel(model: string): void {
  localStorage.setItem(KEY_MODEL, model.trim());
}

export function getEffectiveModel(): string {
  const explicit = getSelectedModel();
  if (explicit) return explicit;
  return getSelectedProvider().defaultModel;
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
  }
  localStorage.removeItem(KEY_PROVIDER);
  localStorage.removeItem(KEY_MODEL);
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

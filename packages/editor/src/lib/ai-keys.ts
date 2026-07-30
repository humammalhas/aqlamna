// ---------------------------------------------------------------------------
// AI key management — stored in localStorage only, never committed.
// In dev, prefill from VITE_DEEPSEEK_API_KEY if present.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "aqlamna-deepseek-key";

/**
 * Get the current DeepSeek API key from localStorage, falling back to the
 * dev-only env var (never available in production builds).
 */
export function getApiKey(): string | null {
  // localStorage first (author's explicit choice)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim().length > 0) return stored.trim();

  // Dev-only fallback — import.meta.env is stripped in production
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      const envKey = (import.meta.env as Record<string, string>).VITE_DEEPSEEK_API_KEY;
      if (envKey && envKey.trim().length > 0) return envKey.trim();
    }
  } catch {
    // import.meta.env not available (e.g., test environment)
  }

  return null;
}

/**
 * Store the API key in localStorage. Returns the key that was stored.
 */
export function setApiKey(key: string): string {
  const trimmed = key.trim();
  localStorage.setItem(STORAGE_KEY, trimmed);
  return trimmed;
}

/**
 * Remove the stored API key.
 */
export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check whether any API key is configured.
 */
export function hasApiKey(): boolean {
  return getApiKey() !== null;
}

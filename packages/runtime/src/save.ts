// ---------------------------------------------------------------------------
// Aqlamna runtime save/restore — localStorage + download/upload
// Zero dependencies.
// ---------------------------------------------------------------------------

import type { StoryState } from "./types.js";

const STORAGE_KEY_PREFIX = "aqlamna_save_";

/**
 * Save game state to localStorage under a story-specific key.
 * Returns the key used.
 */
export function saveToLocalStorage(
  storyTitle: string,
  state: StoryState,
): string {
  const key = STORAGE_KEY_PREFIX + sanitiseKey(storyTitle);
  const data = JSON.stringify(state);
  localStorage.setItem(key, data);
  return key;
}

/**
 * Restore game state from localStorage.
 * Returns null if no save exists for this story.
 */
export function loadFromLocalStorage(
  storyTitle: string,
): StoryState | null {
  const key = STORAGE_KEY_PREFIX + sanitiseKey(storyTitle);
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoryState;
    // Basic validation
    if (
      typeof parsed.passage !== "string" ||
      typeof parsed.variables !== "object" ||
      !Array.isArray(parsed.consumed)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Download state as a JSON file.
 */
export function downloadSave(
  storyTitle: string,
  state: StoryState,
): void {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitiseKey(storyTitle)}_save.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Trigger a file picker to load state from a JSON file.
 * Returns a Promise that resolves with the parsed state, or null if cancelled/invalid.
 */
export function uploadSave(): Promise<StoryState | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.addEventListener("load", () => {
        try {
          const parsed = JSON.parse(reader.result as string) as StoryState;
          if (
            typeof parsed.passage !== "string" ||
            typeof parsed.variables !== "object" ||
            !Array.isArray(parsed.consumed)
          ) {
            resolve(null);
            return;
          }
          resolve(parsed);
        } catch {
          resolve(null);
        }
      });
      reader.addEventListener("error", () => resolve(null));
      reader.readAsText(file);
    });

    // Handle cancel
    input.addEventListener("cancel", () => resolve(null));

    input.click();
  });
}

function sanitiseKey(title: string): string {
  // Remove unsafe characters for localStorage key
  return title.replace(/[^a-zA-Z\u0600-\u06FF0-9_-]/g, "_").slice(0, 64);
}

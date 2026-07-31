// ---------------------------------------------------------------------------
// Aqlamna runtime save/restore — localStorage + download/upload
// Zero dependencies.
// ---------------------------------------------------------------------------

import type { StoryState } from "./types.js";

// The key the reader's bookmark lives under. Unchanged since the toolbar said
// "حفظ / استعادة": one bookmark per story is the same one slot the old save
// button wrote, so every position saved before this change is still there and
// still reachable — it just answers to a different label now.
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
      typeof parsed.consumed !== "object"
    ) {
      return null;
    }
    // Handle old v1 format: consumed was a flat string[].
    if (Array.isArray(parsed.consumed)) {
      console.warn(
        "تنسيق الحفظ قديم — جارٍ تجاهل الخيارات المستهلكة." +
        " القديم: مصفوفة، الجديد: لكل مقطع خياراته.",
      );
      parsed.consumed = {};
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * True when this story has a bookmark stored.
 *
 * Deliberately does NOT parse the payload: the button's label is a question
 * about whether a slot is occupied, and a save that turns out to be corrupt is
 * reported when the reader presses, not by silently offering the other label.
 */
export function hasLocalSave(storyTitle: string): boolean {
  const key = STORAGE_KEY_PREFIX + sanitiseKey(storyTitle);
  return localStorage.getItem(key) !== null;
}

/**
 * Remove this story's bookmark.
 *
 * Returning to a mark spends it — one mark at a time is the deliberate trade,
 * so the slot has to be emptied by the same press that consumes it.
 */
export function clearLocalStorage(storyTitle: string): void {
  const key = STORAGE_KEY_PREFIX + sanitiseKey(storyTitle);
  localStorage.removeItem(key);
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
            typeof parsed.consumed !== "object"
          ) {
            resolve(null);
            return;
          }
          if (Array.isArray(parsed.consumed)) {
            console.warn(
              "تنسيق الحفظ قديم — جارٍ تجاهل الخيارات المستهلكة." +
              " القديم: مصفوفة، الجديد: لكل مقطع خياراته.",
            );
            parsed.consumed = {};
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

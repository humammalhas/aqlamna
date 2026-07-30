// ---------------------------------------------------------------------------
// Zustand store — holds source text, compiled story JSON, and error state.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { compile } from "@aqlamna/core";
import type { StoryJSON } from "@aqlamna/runtime";
import { saveSource } from "./lib/db.js";

// ---- QalamError shape (mirrors @aqlamna/core's QalamError) ----------------

export interface QalamError {
  code: string;
  message_ar: string;
  message_en: string;
  line: number;
  column: number;
}

function isQalamError(err: unknown): err is QalamError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message_ar" in err &&
    "line" in err &&
    "column" in err
  );
}

// ---- Store -----------------------------------------------------------------

export interface EditorStore {
  /** Raw .qalam source in the textarea. */
  source: string;
  setSource: (source: string) => void;

  /** Compiled story JSON — non-null when the last compile succeeded. */
  storyJson: StoryJSON | null;

  /** Last compilation error — non-null when the last compile failed. */
  error: QalamError | null;

  /** Incremented on each successful compile to force PlayerPane remount. */
  playerKey: number;

  /** Compile current source. Updates storyJson or error. */
  compileSource: () => void;

  /** Clear the error (dismissed by the user). */
  clearError: () => void;

  /** Replace the entire source (used for initial load from IndexedDB). */
  loadSource: (source: string) => void;
}

export const useStore = create<EditorStore>((set, get) => ({
  source: "",
  storyJson: null,
  error: null,
  playerKey: 0,

  setSource: (source: string) => {
    set({ source });
    // Persist to IndexedDB (fire-and-forget)
    saveSource(source).catch(() => {});
  },

  compileSource: () => {
    const { source } = get();
    if (source.trim().length === 0) return;

    try {
      const result = compile(source, "editor.qalam") as unknown as StoryJSON;
      set({
        storyJson: result,
        error: null,
        playerKey: get().playerKey + 1,
      });
    } catch (err: unknown) {
      if (isQalamError(err)) {
        set({ error: err, storyJson: null });
      } else {
        // Unexpected error — wrap it
        set({
          error: {
            code: "E000",
            message_ar: err instanceof Error ? err.message : "خطأ غير معروف",
            message_en: err instanceof Error ? err.message : "Unknown error",
            line: 0,
            column: 0,
          },
          storyJson: null,
        });
      }
    }
  },

  clearError: () => set({ error: null }),

  loadSource: (source: string) => set({ source }),
}));

// ---------------------------------------------------------------------------
// Zustand store — holds source text, compiled story JSON, error state,
// and canvas view mode.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { compile } from "@aqlamna/core";
import type { StoryJSON } from "@aqlamna/runtime";
import { saveSource } from "./lib/db.js";
import { getViewMode, setViewMode as persistViewMode, type ViewMode } from "./lib/canvas-db.js";

function loadPane(key: string, def: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? def : v === "1"; }
  catch { return def; }
}
function savePane(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* noop */ }
}

export type PlayerTheme = "dark" | "light" | "book";

export type EditorTheme = "light" | "dark";

function loadEditorTheme(): EditorTheme {
  try {
    const t = localStorage.getItem("aqlamna-editor-theme");
    if (t === "dark") return "dark";
  } catch { /* noop */ }
  return "light";
}

function saveEditorTheme(t: EditorTheme) { try { localStorage.setItem("aqlamna-editor-theme", t); } catch { /* noop */ } }

function loadTheme(): PlayerTheme {
  try {
    const t = localStorage.getItem("aqlamna-player-theme");
    if (t === "light" || t === "book") return t;
  } catch { /* noop */ }
  return "dark";
}

function saveTheme(t: PlayerTheme) {
  try { localStorage.setItem("aqlamna-player-theme", t); } catch { /* noop */ }
}

// ---- QalamError shape (mirrors @aqlamna/core's QalamError) ----------------

export interface QalamError {
  code: string;
  message_ar: string;
  message_en: string;
  line: number;
  column: number;
}

export function isQalamError(err: unknown): err is QalamError {
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

  /** Current view mode: text-only, canvas-only, or split. */
  panePlayer: boolean;
  paneText: boolean;
  paneCanvas: boolean;
  togglePanePlayer: () => void;
  togglePaneText: () => void;
  togglePaneCanvas: () => void;

  viewMode: ViewMode;

  /** Set view mode and persist to IndexedDB. */
  setViewMode: (mode: ViewMode) => void;

  /** Whether the initial view mode has been loaded from IndexedDB. */
  viewModeLoaded: boolean;

  /** Whether the Arabic quality linter is active. Persisted to localStorage. */
  qualityLintEnabled: boolean;

  /** Toggle the quality linter on/off. */
  toggleQualityLint: () => void;

  /** Current player theme (dark | light | book). Persisted to localStorage. */
  playerTheme: PlayerTheme;

  /** Set the player theme and persist. */
  setPlayerTheme: (t: PlayerTheme) => void;

  /** Current editor colour theme. */
  editorTheme: EditorTheme;
  toggleEditorTheme: () => void;

  /** Cursor jump request from canvas → CodeMirror. */
  cursorJump: { name: string; nonce: number } | null;

  /** Request to move the text cursor to a passage header. */
  requestCursorJump: (name: string) => void;

  /** Clear the cursor jump after CodeEditorPane handles it. */
  clearCursorJump: () => void;
}

export const useStore = create<EditorStore>((set, get) => ({
  source: "",
  storyJson: null,
  error: null,
  playerKey: 0,
  panePlayer: loadPane("aqlamna-pane-player", true),
    paneText: loadPane("aqlamna-pane-text", true),
    paneCanvas: loadPane("aqlamna-pane-canvas", false),
    viewMode: "text",
  viewModeLoaded: false,
  qualityLintEnabled: localStorage.getItem("aqlamna-quality-lint") !== "off",
  playerTheme: loadTheme(),
  editorTheme: loadEditorTheme(),

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

  loadSource: (source: string) => {
    set({ source });
    // Also trigger initial view mode load
    getViewMode().then((mode) => {
      set({ viewMode: mode, viewModeLoaded: true });
    }).catch(() => {
      set({ viewModeLoaded: true });
    });
  },

  togglePanePlayer: () => { const n = !get().panePlayer; set({ panePlayer: n }); savePane("aqlamna-pane-player", n); },
  togglePaneText: () => { const n = !get().paneText; set({ paneText: n }); savePane("aqlamna-pane-text", n); },
  togglePaneCanvas: () => { const n = !get().paneCanvas; set({ paneCanvas: n }); savePane("aqlamna-pane-canvas", n); },
  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
    persistViewMode(mode).catch(() => {});
  },

  toggleQualityLint: () => {
    const next = !get().qualityLintEnabled;
    set({ qualityLintEnabled: next });
    try { localStorage.setItem("aqlamna-quality-lint", next ? "on" : "off"); } catch { /* noop */ }
  },

  setPlayerTheme: (t: PlayerTheme) => {
    set({ playerTheme: t });
    saveTheme(t);
  },

  toggleEditorTheme: () => {
    const next = get().editorTheme === "dark" ? "light" : "dark";
    set({ editorTheme: next });
    saveEditorTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  },

  cursorJump: null,

  requestCursorJump: (name: string) => {
    set({ cursorJump: { name, nonce: Date.now() } });
  },

  clearCursorJump: () => set({ cursorJump: null }),
}));

// ---- Init view mode on first load (non-React side-effect) -------------------
// Called once when the module loads to kick off async IndexedDB read
getViewMode().then((mode) => {
  const current = useStore.getState().viewModeLoaded;
  if (!current) {
    useStore.setState({ viewMode: mode, viewModeLoaded: true });
  }
}).catch(() => {
  if (!useStore.getState().viewModeLoaded) {
    useStore.setState({ viewModeLoaded: true });
  }
});

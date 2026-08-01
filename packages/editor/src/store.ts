// ---------------------------------------------------------------------------
// Zustand store — holds source text, compiled story JSON, error state,
// and canvas view mode.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { compile } from "@aqlamna/core";
import type { StoryJSON } from "@aqlamna/runtime";
import { saveSource } from "./lib/db.js";
import { getViewMode, setViewMode as persistViewMode, type ViewMode } from "./lib/canvas-db.js";
import { isEngaged, setEngaged } from "./lib/install.js";
import { starterWriterState, type WriterState } from "./lib/writer-model.js";
import { generateQalam } from "./lib/generate-qalam.js";
import { importWriterState } from "./lib/writer-import.js";

function loadPane(key: string, def: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? def : v === "1"; }
  catch { return def; }
}
function savePane(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* noop */ }
}

export type PlayerTheme = "dark" | "light" | "book";

export type PaneKey = "player" | "text" | "canvas";

const PANE_STORAGE = {
  player: "aqlamna-pane-player",
  text: "aqlamna-pane-text",
  canvas: "aqlamna-pane-canvas",
} as const;

/**
 * Read the persisted pane flags, repairing an impossible state.
 *
 * A previous build let the user switch every pane off. The text pane kept
 * rendering (the layout fell back to it) while its button read OFF, and the
 * disagreement persisted across reloads. An all-off state is not representable
 * any more: it loads as text-on.
 */
function loadPanes(): { panePlayer: boolean; paneText: boolean; paneCanvas: boolean } {
  const panes = {
    panePlayer: loadPane(PANE_STORAGE.player, true),
    paneText: loadPane(PANE_STORAGE.text, true),
    paneCanvas: loadPane(PANE_STORAGE.canvas, false),
  };
  if (!panes.panePlayer && !panes.paneText && !panes.paneCanvas) {
    panes.paneText = true;
    savePane(PANE_STORAGE.text, true);
  }
  return panes;
}

// ---- Writer mode -----------------------------------------------------------
//
// `visual` is the default and the product. `code` is the CodeMirror editor,
// kept whole as the advanced mode — the writer generates the source the code
// editor shows, so nothing is hidden, only spelled differently.

export type WriterMode = "visual" | "code";

const WRITER_MODE_KEY = "aqlamna-writer-mode";

function loadWriterMode(): WriterMode {
  try {
    return localStorage.getItem(WRITER_MODE_KEY) === "code" ? "code" : "visual";
  } catch { return "visual"; }
}

function saveWriterMode(m: WriterMode) {
  try { localStorage.setItem(WRITER_MODE_KEY, m); } catch { /* noop */ }
}

/** Shown when the source does not compile, so the form has nothing to draw. */
export const WRITER_COMPILE_MESSAGE =
  "لا يمكن عرض القصة في المحرّر المرئي حتى يُصلَح الخطأ الظاهر أسفل الشاشة.";

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

  /** Which panes are visible. At least one is ALWAYS true — see togglePane. */
  panePlayer: boolean;
  paneText: boolean;
  paneCanvas: boolean;

  /**
   * Turn a pane on or off, honouring the size limit for the current
   * breakpoint. Never leaves zero panes visible and never leaves more than
   * `maxPanes` visible, so a toggle's state and what is rendered cannot drift
   * apart.
   */
  togglePane: (key: PaneKey, maxPanes: number) => void;

  /**
   * Drop panes until at most `maxPanes` are visible. Called when the window
   * crosses a breakpoint. Keeps them in the order a writer wants them: the
   * text they are writing first, then the player, then the map.
   */
  ensurePaneLimit: (maxPanes: number) => void;

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

  /**
   * True once the writer has actually done something — typed into the editor
   * or played their story. The install offer waits for this, so it is never
   * the first thing a visitor is asked.
   */
  engaged: boolean;

  /** Record a real user action. Idempotent, and remembered across visits. */
  markEngaged: () => void;

  /** Which authoring surface the قصتك tab shows. */
  writerMode: WriterMode;
  setWriterMode: (mode: WriterMode) => void;

  /**
   * The visual writer's own model. Null until the first sync, and while the
   * story is beyond what the form can draw.
   */
  writerState: WriterState | null;

  /**
   * Why the visual writer cannot show this story, in Arabic. Null when it can.
   * Never a silent fallback — the pane prints this and offers the code editor.
   */
  writerBlocked: string | null;

  /**
   * The last source the visual writer generated. Comparing against `source`
   * is how the pane tells its own writes (ignore) from an external change —
   * a load from IndexedDB, an AI insertion, an example, an edit in code mode —
   * which must be re-imported.
   */
  writerEcho: string;

  /**
   * The scene the author last touched. The visual writer has no text cursor,
   * so this is what "أكمل المقطع" means when there are eleven scenes on screen.
   */
  writerFocusScene: string | null;
  setWriterFocusScene: (id: string | null) => void;

  /** Replace the writer model, regenerate `.qalam`, and persist it. */
  setWriterState: (next: WriterState) => void;

  /** Rebuild the writer model from the current source. */
  syncWriterFromSource: () => void;

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
  ...loadPanes(),
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

    // Playing a story is a real action — it is only ever reached from ▶ شغّل,
    // export, or an AI action, never from a page load.
    get().markEngaged();

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

  togglePane: (key: PaneKey, maxPanes: number) => {
    const state = get();
    const on: Record<PaneKey, boolean> = {
      player: state.panePlayer,
      text: state.paneText,
      canvas: state.paneCanvas,
    };

    if (on[key]) {
      // Turning the last visible pane off would render a pane whose button
      // says OFF. Refuse instead.
      const visible = (Object.keys(on) as PaneKey[]).filter((k) => on[k]);
      if (visible.length <= 1) return;
      on[key] = false;
    } else {
      on[key] = true;
      // Over the limit for this size: drop another pane rather than adding a
      // column. The player is kept last — it is the point of the editor.
      let visible = (Object.keys(on) as PaneKey[]).filter((k) => on[k]);
      while (visible.length > maxPanes) {
        const droppable = visible.filter((k) => k !== key);
        const victim = droppable.find((k) => k !== "player") ?? droppable[0];
        if (!victim) break;
        on[victim] = false;
        visible = (Object.keys(on) as PaneKey[]).filter((k) => on[k]);
      }
    }

    set({ panePlayer: on.player, paneText: on.text, paneCanvas: on.canvas });
    for (const k of Object.keys(on) as PaneKey[]) {
      savePane(PANE_STORAGE[k], on[k]);
    }
  },
  ensurePaneLimit: (maxPanes: number) => {
    const state = get();
    const on: Record<PaneKey, boolean> = {
      player: state.panePlayer,
      text: state.paneText,
      canvas: state.paneCanvas,
    };
    const keepOrder: PaneKey[] = ["text", "player", "canvas"];
    const visible = keepOrder.filter((k) => on[k]);
    if (visible.length <= maxPanes && visible.length > 0) return;

    const keep = new Set(visible.slice(0, Math.max(1, maxPanes)));
    if (keep.size === 0) keep.add("text");

    for (const k of keepOrder) on[k] = keep.has(k);
    set({ panePlayer: on.player, paneText: on.text, paneCanvas: on.canvas });
    for (const k of keepOrder) savePane(PANE_STORAGE[k], on[k]);
  },

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

  engaged: isEngaged(),

  markEngaged: () => {
    if (get().engaged) return;
    set({ engaged: true });
    setEngaged();
  },

  writerMode: loadWriterMode(),
  writerState: null,
  writerBlocked: null,
  writerEcho: "",
  writerFocusScene: null,

  setWriterFocusScene: (id: string | null) => set({ writerFocusScene: id }),

  setWriterMode: (mode: WriterMode) => {
    set({ writerMode: mode });
    saveWriterMode(mode);
    // Coming back from code mode, the source is whatever was typed there.
    if (mode === "visual") get().syncWriterFromSource();
  },

  setWriterState: (next: WriterState) => {
    const source = generateQalam(next);
    // `writerEcho` is set in the same update as `source`, so the pane's
    // "did somebody else change this?" check can never see a torn state.
    set({ writerState: next, writerBlocked: null, writerEcho: source, source });
    saveSource(source).catch(() => {});
    get().markEngaged();
  },

  syncWriterFromSource: () => {
    const { source } = get();

    // Nothing saved yet: open on one empty scene rather than a blank page, and
    // leave `source` alone so an untouched visit writes nothing to IndexedDB.
    if (source.trim().length === 0) {
      set({ writerState: starterWriterState(), writerBlocked: null, writerEcho: source });
      return;
    }

    let story: StoryJSON;
    try {
      story = compile(source, "editor.qalam") as unknown as StoryJSON;
    } catch {
      // A syntax error is only reachable from code mode. The error strip
      // already names it; the form cannot draw a story that does not exist.
      set({ writerState: null, writerBlocked: WRITER_COMPILE_MESSAGE, writerEcho: source });
      return;
    }

    const result = importWriterState(story);
    if (result.ok) {
      set({ writerState: result.state, writerBlocked: null, writerEcho: source });
    } else {
      set({ writerState: null, writerBlocked: result.reason, writerEcho: source });
    }
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

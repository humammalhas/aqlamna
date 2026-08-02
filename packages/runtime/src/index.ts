// ---------------------------------------------------------------------------
// Aqlamna runtime — public entry point
// mount(storyJson, element) initialises and renders the player.
// ---------------------------------------------------------------------------

import { Engine } from "./engine.js";
import { renderScene } from "./renderer.js";
import {
  saveToLocalStorage,
  loadFromLocalStorage,
  hasLocalSave,
  clearLocalStorage,
} from "./save.js";
import type { StoryJSON, StoryScene, StoryState } from "./types.js";

export { Engine } from "./engine.js";
export { renderScene } from "./renderer.js";
export {
  saveToLocalStorage,
  loadFromLocalStorage,
  hasLocalSave,
  clearLocalStorage,
  downloadSave,
  uploadSave,
} from "./save.js";
export type {
  StoryJSON,
  StoryState,
  StoryScene,
  OutputNode,
  AvailableChoice,
  PlayerTheme,
} from "./types.js";

export interface MountOptions {
  /** If false, the toolbar is not rendered at all. Default true. */
  showToolbar?: boolean;
  /** Called when the player clicks the theme toggle button. */
  onThemeToggle?: () => void;
}

/**
 * Mount the runtime player into a DOM element.
 * Handles the full game loop: start → render → choose → advance → render.
 *
 * This is the ONLY game loop. The standalone export used to carry a
 * hand-written copy of it inside build-runtime.mjs, with its own onSave and
 * onLoad — which is how "save feedback is implemented" stayed true of this file
 * and false of every exported story for a day. The bootstrap now calls mount().
 *
 * Returns an unmount function that clears the element.
 */
export function mount(
  storyJson: StoryJSON,
  element: HTMLElement,
  options: MountOptions = {},
): () => void {
  const showToolbar = options.showToolbar !== false;
  const title = storyJson.title ?? "قصة تفاعلية";
  // `مؤلف:` in the source, a field in the visual writer, and until now dropped
  // between the compiler and the screen.
  const author = storyJson.author ?? null;

  // Mutable engine reference — replaced on restart
  let engine = new Engine(storyJson);

  // Every localStorage call is guarded. A browser in private mode throws on
  // read as well as write, and an unguarded throw here takes the whole click
  // handler down — the reader would press the button and get nothing, which is
  // exactly the "it looks dead" failure this work exists to remove.
  function bookmarkExists(): boolean {
    try {
      return hasLocalSave(title);
    } catch {
      return false;
    }
  }

  function render(scene: StoryScene, notice?: string): void {
    renderScene(
      element,
      scene,
      title,
      author,
      {
        onChoice: (choiceId: string) => {
          const next = engine.choose(choiceId);
          render(next);
        },
        onRestart: () => {
          engine = new Engine(storyJson);
          render(engine.start(), "بدأنا القصة من جديد");
        },
        hasBookmark: bookmarkExists,
        onBookmarkSet: () => {
          try {
            saveToLocalStorage(title, engine.getState());
            return "وضعنا العلامة";
          } catch {
            return "تعذّر وضع العلامة";
          }
        },
        onBookmarkReturn: () => {
          let saved: StoryState | null = null;
          try {
            saved = loadFromLocalStorage(title);
          } catch {
            saved = null;
          }
          // Nothing to go back to: no re-render happened, so this message is
          // the caller's to show. Every other path returns "".
          if (!saved) return "تعذّرت العودة إلى العلامة";

          // Returning to a mark spends it — clear before restoring, so a
          // failure to clear cannot leave the reader at the mark with the
          // button still offering to take them back to where they already are.
          try {
            clearLocalStorage(title);
          } catch {
            return "تعذّرت العودة إلى العلامة";
          }
          engine.loadState(saved);
          render(engine.start(), "رجعنا إلى العلامة");
          return "";
        },
        showToolbar,
        onThemeToggle: options.onThemeToggle,
      },
      notice,
    );
  }

  // Initial render
  render(engine.start());

  return () => {
    element.innerHTML = "";
  };
}

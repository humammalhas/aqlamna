// ---------------------------------------------------------------------------
// Aqlamna runtime — public entry point
// mount(storyJson, element) initialises and renders the player.
// ---------------------------------------------------------------------------

import { Engine } from "./engine.js";
import { renderScene } from "./renderer.js";
import {
  saveToLocalStorage,
  loadFromLocalStorage,
  downloadSave,
  uploadSave,
} from "./save.js";
import type { StoryJSON, StoryScene } from "./types.js";

export { Engine } from "./engine.js";
export { renderScene } from "./renderer.js";
export {
  saveToLocalStorage,
  loadFromLocalStorage,
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
  /** If true, show save/load/download buttons. Default true. */
  showToolbar?: boolean;
  /** Called when the player clicks the theme toggle button. */
  onThemeToggle?: () => void;
}

/**
 * Mount the runtime player into a DOM element.
 * Handles the full game loop: start → render → choose → advance → render.
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

  // Mutable engine reference — replaced on restart
  let engine = new Engine(storyJson);

  function render(scene: StoryScene): void {
    renderScene(element, scene, title, {
      onChoice: (choiceId: string) => {
        const next = engine.choose(choiceId);
        render(next);
      },
      onRestart: () => {
        engine = new Engine(storyJson);
        render(engine.start());
      },
      onSave: () => {
        if (showToolbar) {
          saveToLocalStorage(title, engine.getState());
        }
      },
      onLoad: async () => {
        if (showToolbar) {
          const saved = loadFromLocalStorage(title);
          if (saved) {
            engine.loadState(saved);
            render(engine.start());
          }
        }
      },
    });
  }

  // Initial render
  render(engine.start());

  return () => {
    element.innerHTML = "";
  };
}

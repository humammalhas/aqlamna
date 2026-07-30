// ---------------------------------------------------------------------------
// Aqlamna runtime renderer — DOM rendering, RTL-first
// Zero dependencies. Uses CSS logical properties only.
// ---------------------------------------------------------------------------

import type { StoryScene, AvailableChoice, OutputNode } from "./types.js";

export interface RendererOptions {
  /** Called when the player picks a choice. Passes the choice ID. */
  onChoice: (choiceId: string) => void;
  /** Called when the player clicks restart. */
  onRestart: () => void;
  /** Called when the player clicks save. */
  onSave: () => void;
  /** Called when the player clicks load. */
  onLoad: () => void;
}

/**
 * Renders a story scene into a container element.
 * Creates RTL-first DOM with choice buttons.
 */
export function renderScene(
  container: HTMLElement,
  scene: StoryScene,
  title: string | null,
  options: RendererOptions,
): void {
  container.innerHTML = "";

  // Story wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "aq-story";

  // Title
  if (title) {
    const titleEl = document.createElement("h1");
    titleEl.className = "aq-title";
    titleEl.textContent = title;
    wrapper.appendChild(titleEl);
  }

  // Output area
  const outputEl = document.createElement("div");
  outputEl.className = "aq-output";

  for (const node of scene.output) {
    if (node.type === "text") {
      const p = document.createElement("p");
      p.className = "aq-text";
      p.textContent = node.value;
      outputEl.appendChild(p);
    } else if (node.type === "linebreak") {
      outputEl.appendChild(document.createElement("br"));
    }
  }

  wrapper.appendChild(outputEl);

  // Choices
  if (scene.choices.length > 0) {
    const choicesEl = document.createElement("div");
    choicesEl.className = "aq-choices";

    for (const choice of scene.choices) {
      const btn = document.createElement("button");
      btn.className = "aq-choice-btn";
      btn.textContent = choice.label;
      btn.addEventListener("click", () => {
        options.onChoice(choice.id);
      });
      choicesEl.appendChild(btn);
    }

    wrapper.appendChild(choicesEl);
  }

  // End state
  if (scene.ended && scene.choices.length === 0) {
    const endEl = document.createElement("div");
    endEl.className = "aq-end";

    const endText = document.createElement("p");
    endText.className = "aq-text aq-end-text";
    endText.textContent = "انتهت القصة.";
    endEl.appendChild(endText);

    const restartBtn = document.createElement("button");
    restartBtn.className = "aq-btn aq-restart-btn";
    restartBtn.textContent = "⟲ أعد القصة";
    restartBtn.addEventListener("click", options.onRestart);
    endEl.appendChild(restartBtn);

    wrapper.appendChild(endEl);
  }

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "aq-toolbar";

  const saveBtn = document.createElement("button");
  saveBtn.className = "aq-btn aq-save-btn";
  saveBtn.textContent = "💾 حفظ";
  saveBtn.addEventListener("click", options.onSave);

  const loadBtn = document.createElement("button");
  loadBtn.className = "aq-btn aq-load-btn";
  loadBtn.textContent = "📂 تحميل";
  loadBtn.addEventListener("click", options.onLoad);

  toolbar.appendChild(saveBtn);
  toolbar.appendChild(loadBtn);

  if (scene.choices.length > 0 || !scene.ended) {
    const restartBtn = document.createElement("button");
    restartBtn.className = "aq-btn aq-restart-btn";
    restartBtn.textContent = "⟲ أعد";
    restartBtn.addEventListener("click", options.onRestart);
    toolbar.appendChild(restartBtn);
  }

  wrapper.appendChild(toolbar);
  container.appendChild(wrapper);
}

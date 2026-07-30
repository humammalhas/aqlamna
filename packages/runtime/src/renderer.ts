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
  /** Called when the player clicks save. Returns the feedback message. */
  onSave: () => string;
  /** Called when the player clicks load. Returns the feedback message. */
  onLoad: () => Promise<string>;
  /** Called when the player clicks the theme toggle. */
  onThemeToggle?: () => void;
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

  // Output area — group consecutive text and linebreak nodes into paragraphs.
  // Text nodes arising from text + interpolation + text must render inline
  // as a single paragraph.  Linebreaks become <br> inside the paragraph.
  const outputEl = document.createElement("div");
  outputEl.className = "aq-output";

  // null sentinel means <br>; string means a text run
  const run: Array<string | null> = [];

  function flushRun(): void {
    if (run.length === 0) return;
    const p = document.createElement("p");
    p.className = "aq-text";
    for (const item of run) {
      if (item === null) {
        p.appendChild(document.createElement("br"));
      } else {
        p.appendChild(document.createTextNode(item));
      }
    }
    outputEl.appendChild(p);
    run.length = 0;
  }

  for (const node of scene.output) {
    if (node.type === "text") {
      run.push(node.value);
    } else if (node.type === "linebreak") {
      run.push(null);
    }
  }
  flushRun();

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
  saveBtn.addEventListener("click", () => {
    const msg = options.onSave();
    showFeedback(toolbar, msg);
  });

  const loadBtn = document.createElement("button");
  loadBtn.className = "aq-btn aq-load-btn";
  loadBtn.textContent = "📂 استعادة";
  loadBtn.addEventListener("click", async () => {
    const msg = await options.onLoad();
    showFeedback(toolbar, msg);
  });

  toolbar.appendChild(saveBtn);
  toolbar.appendChild(loadBtn);

  // Theme toggle button — only shown if callback is provided
  if (options.onThemeToggle) {
    const themeBtn = document.createElement("button");
    themeBtn.className = "aq-btn aq-theme-btn";
    themeBtn.textContent = "🎨";
    themeBtn.title = "تغيير المظهر";
    themeBtn.addEventListener("click", options.onThemeToggle);
    toolbar.appendChild(themeBtn);
  }

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

function showFeedback(toolbar: HTMLElement, msg: string) {
  const old = toolbar.querySelector(".aq-feedback");
  if (old) old.remove();

  const span = document.createElement("span");
  span.className = "aq-feedback";
  span.textContent = msg;
  toolbar.appendChild(span);

  setTimeout(() => {
    if (span.parentNode) span.remove();
  }, 2000);
}

// ---------------------------------------------------------------------------
// Aqlamna runtime renderer — DOM rendering, RTL-first
// Zero dependencies. Uses CSS logical properties only.
// ---------------------------------------------------------------------------

import type { StoryScene, AvailableChoice, OutputNode, ImageOutputNode } from "./types.js";

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

  // Output area — PHASE1_SPEC §1.16.
  //   text        → a run of prose inside the current paragraph
  //   linebreak   → <br> inside the current paragraph
  //   paragraph   → close the current <p> and open a new one
  //   image       → close the current <p>, then emit the figure
  // Text arising from text + interpolation + text stays in one paragraph
  // because the engine emits no `paragraph` node between them.
  const outputEl = document.createElement("div");
  outputEl.className = "aq-output";

  // null sentinel means <br>; string means a text run
  const run: Array<string | null> = [];

  function flushRun(): void {
    // A run of nothing but line breaks is not a paragraph — drop it rather
    // than emitting an empty <p> that pushes the prose around.
    if (!run.some((item) => item !== null && item !== "")) {
      run.length = 0;
      return;
    }
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
    } else if (node.type === "paragraph") {
      flushRun();
    } else if (node.type === "image") {
      flushRun();
      outputEl.appendChild(renderImage(node));
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

/**
 * Render an image output node.
 * With `data`: emits <img src="data:..." alt="desc">.
 * Without `data`: emits a bordered placeholder showing the Arabic description.
 */
function renderImage(node: ImageOutputNode): HTMLElement {
  if (node.data) {
    const img = document.createElement("img");
    img.className = "aq-image";
    img.src = node.data;
    img.alt = node.alt;
    return img;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "aq-image-placeholder";
  placeholder.textContent = node.alt;
  return placeholder;
}

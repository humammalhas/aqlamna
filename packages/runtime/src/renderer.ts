// ---------------------------------------------------------------------------
// Aqlamna runtime renderer — DOM rendering, RTL-first
// Zero dependencies. Uses CSS logical properties only.
// ---------------------------------------------------------------------------

import type { StoryScene, AvailableChoice, OutputNode, ImageOutputNode } from "./types.js";

export interface RendererOptions {
  /** Called when the player picks a choice. Passes the choice ID. */
  onChoice: (choiceId: string) => void;
  /**
   * Restart from the first passage. Re-renders, so its confirmation reaches
   * the reader as the NEXT render's `notice` — a message written here would be
   * destroyed, because renderScene opens with `container.innerHTML = ""`.
   */
  onRestart: () => void;
  /** True when this story has a bookmark right now. Chooses the mark button's label. */
  hasBookmark: () => boolean;
  /**
   * Place a bookmark at the current position. Does NOT re-render — nothing on
   * screen changed — so it returns the message and the renderer shows it in place.
   */
  onBookmarkSet: () => string;
  /**
   * Return to the bookmark and spend it. Returns "" on success: it re-rendered,
   * and the confirmation arrives as that render's `notice`. Returns a message
   * only when there was nothing to go back to and nothing was re-rendered.
   */
  onBookmarkReturn: () => string;
  /** Called when the player clicks the theme toggle. */
  onThemeToggle?: () => void;
  /** Suppress the toolbar entirely. Default true (shown). */
  showToolbar?: boolean;
}

/**
 * One button, two directions. The label names what the NEXT press will do.
 *
 * It replaced two buttons that were one idea split in half: both were named
 * after storage rather than after direction, so neither said which way the
 * reader was going, and their icons — a floppy disk and a file folder — came
 * from an office rather than from a book. A ribbon belongs to a book.
 *
 * The retired strings are deliberately not quoted here. This comment is inlined
 * verbatim into every exported story, and a grep of the shipped artifact asking
 * "are the old buttons gone?" must not be answered by this file. That assertion
 * lives in tests/embedded-toolbar.spec.ts, which does not ship.
 */
const MARK_SET = "🔖 ضع علامة";
const MARK_RETURN = "🔖 ارجع إلى العلامة";

function markLabel(marked: boolean): string {
  return marked ? MARK_RETURN : MARK_SET;
}

/**
 * Paragraph classes.
 *
 * `aq-after-choice` is the beat that answers a click — a line the author wrote
 * under the choice itself, not part of the passage it lands in. It is bold and
 * accented in all three themes so a reader can see at a glance which sentence
 * their own hand caused.
 */
const TEXT_CLASS = "aq-text";
const AFTER_CHOICE_CLASS = "aq-text aq-after-choice";

/** How many leading items satisfy `pred` — the length of the matching prefix. */
function countWhile<T>(items: T[], pred: (item: T) => boolean): number {
  let i = 0;
  while (i < items.length && pred(items[i]!)) i++;
  return i;
}

/**
 * How long a confirmation stays on screen.
 *
 * 2000ms was too short for a line the eye is not already resting on, and that
 * message is the only evidence the button did anything at all.
 */
const FEEDBACK_MS = 3500;

/**
 * Renders a story scene into a container element.
 * Creates RTL-first DOM with choice buttons.
 *
 * `notice` is a confirmation belonging to the action that caused this render.
 * Restart and "return to the mark" both rebuild the DOM, so their message
 * cannot be written before the render — it has to be handed to it.
 */
export function renderScene(
  container: HTMLElement,
  scene: StoryScene,
  title: string | null,
  options: RendererOptions,
  notice?: string,
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

  function flushRun(className: string): void {
    // A run of nothing but line breaks is not a paragraph — drop it rather
    // than emitting an empty <p> that pushes the prose around.
    if (!run.some((item) => item !== null && item !== "")) {
      run.length = 0;
      return;
    }
    const p = document.createElement("p");
    p.className = className;
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

  /** Draw one stretch of nodes, every paragraph it opens carrying `className`. */
  function emit(nodes: OutputNode[], className: string): void {
    for (const node of nodes) {
      if (node.type === "text") {
        run.push(node.value);
      } else if (node.type === "linebreak") {
        run.push(null);
      } else if (node.type === "paragraph") {
        flushRun(className);
      } else if (node.type === "image") {
        flushRun(className);
        outputEl.appendChild(renderImage(node));
      }
    }
    // Never leave a run open across the seam between two stretches: the beat
    // and the passage's prose are different voices and must not share a <p>.
    flushRun(className);
  }

  // The engine hands a chosen line's own text to the next passage as a PREFIX
  // of its output (engine.ts → choose → advance), marked `afterChoice`. Drawn
  // in array order that put the beat above the destination's opening picture:
  // the reader saw the answer to their click, then the photograph of the place
  // they had only just arrived in. The picture is the top of the passage.
  const beatEnd = countWhile(scene.output, (n) => n.afterChoice === true);
  const beat = scene.output.slice(0, beatEnd);
  const passage = scene.output.slice(beatEnd);
  const leadImages = countWhile(passage, (n) => n.type === "image");

  emit(passage.slice(0, leadImages), TEXT_CLASS);
  emit(beat, AFTER_CHOICE_CLASS);
  emit(passage.slice(leadImages), TEXT_CLASS);

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

  // Toolbar — bookmark / restart.
  //
  // Omitted entirely when the story is running inside a frame. An embedded
  // story is a preview of what the engine does, not somebody's reading
  // session: there is nothing worth bookmarking, a mark would be shared with
  // whoever opens the story directly, and the buttons add chrome to a box that
  // is already shorter than its content.
  //
  // Not an empty toolbar — no element at all, so the border, the 3rem margin
  // and the height all go with it.
  if (options.showToolbar !== false && !isEmbedded()) {
    const toolbar = document.createElement("div");
    toolbar.className = "aq-toolbar";

    const markBtn = document.createElement("button");
    markBtn.className = "aq-btn aq-mark-btn";
    let marked = options.hasBookmark();
    markBtn.textContent = markLabel(marked);
    markBtn.addEventListener("click", () => {
      // Do what the label promised, not what a fresh reading of storage says.
      // If the mark disappeared between paint and press — another tab, a
      // cleared browser — the reader pressed "go back to the mark"; quietly
      // placing a new one instead is the button doing the opposite of what it
      // said. onBookmarkReturn reports the loss and nothing moves.
      const msg = marked ? options.onBookmarkReturn() : options.onBookmarkSet();
      // Ask now, though, rather than assuming the press succeeded — a full disk
      // or a blocked localStorage leaves the mark exactly where it was, and a
      // label that flipped anyway would lie about what the NEXT press does.
      marked = options.hasBookmark();
      markBtn.textContent = markLabel(marked);
      showFeedback(toolbar, msg);
    });
    toolbar.appendChild(markBtn);

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

    // The confirmation for whatever caused this render. Written after the
    // toolbar exists, because it lives inside it.
    if (notice) showFeedback(toolbar, notice);
  }

  container.appendChild(wrapper);
}

/**
 * True when this document is running inside a frame.
 *
 * Comparing `window.self` to `window.top` is safe across origins — it compares
 * two references and never reads a property of the other document, so it does
 * not throw the way `window.top.location` would.
 *
 * The `typeof` guard is not defensive padding: the runtime's own tests execute
 * the shipped bundle in plain Node against a DOM stub, with no `window` in
 * scope at all. Without it every renderer test throws ReferenceError.
 */
function isEmbedded(): boolean {
  return typeof window !== "undefined" && window.self !== window.top;
}

/**
 * Show a confirmation beside the buttons.
 *
 * A `<span>` appended INTO `.aq-toolbar`, which is `display: flex` — so it is
 * one more item on the same row, vertically centred by `align-self: center`.
 * That placement is the point: the message used to be the only proof a button
 * had done anything, and anything that pushes it onto a line of its own puts it
 * where nobody is looking.
 */
function showFeedback(toolbar: HTMLElement, msg: string): void {
  // "" is how a handler says "I re-rendered, the message went with the render".
  // Appending an empty span would still shift the centred row.
  if (!msg) return;

  const old = toolbar.querySelector(".aq-feedback");
  if (old) old.remove();

  const span = document.createElement("span");
  span.className = "aq-feedback";
  span.textContent = msg;
  toolbar.appendChild(span);

  setTimeout(() => {
    if (span.parentNode) span.remove();
  }, FEEDBACK_MS);
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

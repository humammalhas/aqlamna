// ---------------------------------------------------------------------------
// Story actions shared by the editor pane header and the phone overflow menu.
//
// One implementation, two call sites. On phone these two buttons move out of
// the pane header and into the top bar's ☰ menu; hand-copying them there is
// how a handler goes stale in one place and nobody notices.
// ---------------------------------------------------------------------------

import { useStore } from "../store.js";
import { SEED_STORY, SEED_IMAGES } from "../generated/seed-story.js";

/**
 * Start over — and this is also the way BACK.
 *
 * It used to call `setSource("")` and nothing else. In code mode that cleared
 * the document and left the writer looking at an empty CodeMirror, with the
 * visual writer reachable only through ⚙️ الإعدادات ← وضع المحرر, which nobody
 * finds. Measured: after opening the example and taking its escape hatch,
 * قصة جديدة changed nothing on screen. The author was locked into the advanced
 * mode by two clicks and had no way out of it.
 *
 * "New story" is the one button whose meaning is unambiguous in every state, so
 * it is the one that returns you to the default surface.
 */
export function newStory(): void {
  const { source, setSource, setWriterMode } = useStore.getState();
  if (source.trim().length > 0) {
    if (!window.confirm("سيؤدي هذا إلى مسح النص الحالي. هل تريد الاستمرار؟")) {
      return;
    }
  }
  setSource("");
  setWriterMode("visual");
}

/**
 * Load the worked example.
 *
 * The example is `stories/طائرة_الورق.qalam`, chosen because it uses only what
 * the visual writer can draw. It used to be العطر المفقود, which uses
 * multi-branch conditionals and interpolation — so this button ejected the
 * author from the pane into a "this story is too advanced" banner. The example
 * that teaches the editor cannot be the one that closes it.
 *
 * This does NOT change the mode. Loading an example is not a request to switch
 * surfaces, and somebody who deliberately turned on متقدّم should get the
 * example as source. The reason it was safe to leave the mode alone is the
 * story itself: it now opens in either surface. `newStory` is the reset.
 */
export function openExample(): void {
  const { source, setSource } = useStore.getState();
  if (source.trim().length > 0) {
    if (!window.confirm("سيؤدي هذا إلى استبدال النص الحالي. هل تريد الاستمرار؟")) {
      return;
    }
  }
  // Seed the pictures BEFORE the source. The scene card reads IndexedDB when
  // its image name appears, and nothing re-reads it afterwards — seeding after
  // `setSource` raced the render and lost, so the card showed a placeholder
  // while the player showed the picture.
  void seedExampleImages().then(() => setSource(SEED_STORY));
}

/**
 * Put the example's pre-drawn pictures into IndexedDB.
 *
 * `putImage` and not `saveImage`: these bytes are already the pipeline's own
 * output — 768px WebP — and `saveImage` would re-run the canvas downscaler over
 * them, re-encoding a finished image for nothing.
 */
async function seedExampleImages(): Promise<void> {
  const entries = Object.entries(SEED_IMAGES);
  if (entries.length === 0) return;
  try {
    const { putImage, loadImage, DEFAULT_PROJECT_ID } = await import("./image-db.js");
    for (const [name, dataUrl] of entries) {
      // Never overwrite a picture the author drew themselves.
      if (await loadImage(DEFAULT_PROJECT_ID, name)) continue;
      await putImage(DEFAULT_PROJECT_ID, name, dataUrl);
    }
  } catch {
    /* private mode, quota, a blocked DB — the story still works without it */
  }
}

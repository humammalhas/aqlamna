// ---------------------------------------------------------------------------
// Story actions shared by the editor pane header and the phone overflow menu.
//
// One implementation, two call sites. On phone these two buttons move out of
// the pane header and into the top bar's ☰ menu; hand-copying them there is
// how a handler goes stale in one place and nobody notices.
// ---------------------------------------------------------------------------

import { useStore } from "../store.js";
import { SEED_STORY } from "../generated/seed-story.js";

/** Clear the editor. Confirms first when there is something to lose. */
export function newStory(): void {
  const { source, setSource } = useStore.getState();
  if (source.trim().length > 0) {
    if (!window.confirm("سيؤدي هذا إلى مسح النص الحالي. هل تريد الاستمرار؟")) {
      return;
    }
  }
  setSource("");
}

/** Load العطر المفقود as a worked example. Confirms first. */
export function openExample(): void {
  const { source, setSource } = useStore.getState();
  if (source.trim().length > 0) {
    if (!window.confirm("سيؤدي هذا إلى استبدال النص الحالي. هل تريد الاستمرار؟")) {
      return;
    }
  }
  setSource(SEED_STORY);
}

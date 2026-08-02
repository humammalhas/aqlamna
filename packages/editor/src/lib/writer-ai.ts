// ---------------------------------------------------------------------------
// AI co-writing → the visual writer.
//
// `ai.ts` still returns `.qalam`, still compiles every response through
// `@aqlamna/core` before the author sees it, and still carries ARABIC_MASTERY
// as its system prompt. What changes here is where an accepted response lands:
// in code mode it is appended to the source; in the visual writer it becomes
// prose in a scene, choice sub-cards, or a new scene card.
//
// The fragment is turned into those parts by compiling it, not by parsing it a
// second time by hand. A second parser is a second set of bugs, and the one
// thing this project has learned twice over is that the generated artifact and
// the source drift the moment two things claim to understand the same syntax.
// ---------------------------------------------------------------------------

import { compile } from "@aqlamna/core";
import type { StoryJSON } from "@aqlamna/runtime";
import { buildNameMap, generateQalam } from "./generate-qalam.js";
import { importSingleScene } from "./writer-import.js";
import {
  emptyScene,
  nextSceneTitle,
  nextId,
  type Scene,
  type WriterState,
} from "./writer-model.js";

export type AIApplyAction = "suggest_choices" | "continue_scene" | "write_passage";

export type ApplyResult =
  | { ok: true; state: WriterState; sceneId: string }
  | { ok: false; reason: string };

/**
 * The scene an accepted suggestion will land in.
 *
 * `writerFocusScene` is the last scene card the author touched, and it can be
 * STALE: scene ids are regenerated every time the story is re-imported — a
 * reload, switching to متقدّم and back, opening the example. A stale id used to
 * match no scene at all, and `scenes.map` then returned the story unchanged:
 * the apply reported success and nothing appeared anywhere. Falling back to the
 * last scene is a guess; silently doing nothing is a bug.
 *
 * Exported so the panel can NAME the target before the author presses أضف,
 * rather than leaving them to find out afterwards by scrolling.
 */
export function aiTargetScene(state: WriterState, focusSceneId: string | null): Scene | null {
  const focused = focusSceneId ? state.scenes.find((s) => s.id === focusSceneId) : undefined;
  return focused ?? state.scenes[state.scenes.length - 1] ?? null;
}

/**
 * The `.qalam` body of one scene, for the AI prompt's "المقطع الحالي".
 *
 * `AIActions` used to take the LAST passage of the source for every request,
 * which was right while there was a cursor and the writer typed at the bottom.
 * In the form there is no cursor: the answer lands in the scene the author last
 * touched, so the question has to be about that scene too. Otherwise "أكمل
 * المقطع" on scene 3 of 11 reads scene 11 and continues the wrong story.
 *
 * Returns "" when there is no such scene, and the caller falls back.
 */
export function sceneContextText(state: WriterState, sceneId: string | null): string {
  if (!sceneId) return "";
  const passage = buildNameMap(state).scene.get(sceneId);
  if (!passage) return "";

  const source = generateQalam(state);
  const header = `=== ${passage} ===`;
  const start = source.indexOf(header);
  if (start === -1) return "";

  const after = source.slice(start + header.length);
  const next = after.search(/^=== /m);
  return (next === -1 ? after : after.slice(0, next)).trim();
}

/** A passage name the author's own scenes will not have taken. */
function scratchName(taken: Set<string>): string {
  let name = "مقطع_مؤقت_للذكاء";
  while (taken.has(name)) name += "_";
  return name;
}

/**
 * Fold an accepted AI fragment into the writer state.
 *
 * The fragment is compiled inside a copy of the author's real story, so a
 * divert the AI wrote to an existing scene resolves, and a tag it referenced is
 * declared. Anything the fragment contains that the form cannot draw stops the
 * whole apply and says so — half of a suggestion is worse than none.
 */
export function applyAIFragment(
  state: WriterState,
  action: AIApplyAction,
  fragment: string,
  focusSceneId: string | null,
): ApplyResult {
  const trimmed = fragment.trim();
  if (trimmed.length === 0) return { ok: false, reason: "لم يعد الذكاء الاصطناعي بنصّ." };

  const names = buildNameMap(state);
  const scratch = scratchName(new Set(names.scene.values()));
  const source = `${generateQalam(state)}\n=== ${scratch} ===\n\n${trimmed}\n`;

  let story: StoryJSON;
  try {
    story = compile(source, "ai-fragment.qalam") as unknown as StoryJSON;
  } catch {
    return { ok: false, reason: "لم يتّسق اقتراح الذكاء الاصطناعي مع قصتك." };
  }

  const passageToSceneId = new Map<string, string>();
  for (const [sceneId, passage] of names.scene) passageToSceneId.set(passage, sceneId);

  const imported = importSingleScene(
    story,
    scratch,
    { tags: state.tags, counters: state.counters },
    passageToSceneId,
    nextId("s"),
  );
  if (!imported.ok) {
    return {
      ok: false,
      reason: `اقتراح الذكاء الاصطناعي يستخدم ما لا يعرضه المحرّر المرئي: ${imported.reason}`,
    };
  }
  const parsed: Scene = imported.scene;

  if (action === "write_passage") {
    const scene = { ...parsed, id: parsed.id, title: nextSceneTitle(state.scenes) };
    return { ok: true, state: { ...state, scenes: [...state.scenes, scene] }, sceneId: scene.id };
  }

  const target = aiTargetScene(state, focusSceneId);
  if (!target) {
    // No scene to add to: make one rather than dropping the author's request.
    const scene = { ...emptyScene(nextSceneTitle(state.scenes)), prose: parsed.prose, choices: parsed.choices };
    return { ok: true, state: { ...state, scenes: [...state.scenes, scene] }, sceneId: scene.id };
  }

  return {
    ok: true,
    sceneId: target.id,
    state: {
      ...state,
      scenes: state.scenes.map((sc) => {
        if (sc.id !== target.id) return sc;
        if (action === "continue_scene") {
          const joined = sc.prose.trim().length > 0 ? `${sc.prose.trimEnd()}\n\n${parsed.prose}` : parsed.prose;
          return { ...sc, prose: joined };
        }
        return { ...sc, choices: [...sc.choices, ...parsed.choices] };
      }),
    },
  };
}

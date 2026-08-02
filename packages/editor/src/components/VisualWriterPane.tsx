// ---------------------------------------------------------------------------
// VisualWriterPane — the authoring surface for people who do not write code.
//
// A vertical document of scene cards. Every structural thing in the language is
// a field, a dropdown, a checkbox or a button; `===`, `->`, `~`, `*`, `+` and
// `{ }` appear nowhere on this screen. On every change the pane serialises
// itself to `.qalam` and hands it to the store, so شغّل, تصدير and مخطط keep
// working exactly as they did — they read the compiled JSON and neither of them
// knows this pane exists.
//
// It is also the pane that must never eat somebody's story. When the source
// holds anything the form cannot draw, the pane refuses to draw ANY of it and
// says why, rather than showing a partial story that would overwrite the rest
// on the first keystroke.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store.js";
import {
  emptyChoice,
  emptyConditionalText,
  emptyScene,
  nextSceneTitle,
  type Counter,
  type Scene,
  type WriterState,
} from "../lib/writer-model.js";
import { validateWriterState, type WriterIssue } from "../lib/generate-qalam.js";
import { newStory } from "../lib/story-actions.js";
import SceneCard from "./writer/SceneCard.js";
import AutoTextarea from "./writer/AutoTextarea.js";
import { askName } from "./writer/WriterControls.js";
import {
  accentButton,
  card,
  dangerButton,
  ghostButton,
  input,
  label as labelStyle,
  noteText,
  PROSE_FONT,
  row,
  warnBox,
} from "./writer/writer-ui.js";

export default function VisualWriterPane() {
  const source = useStore((s) => s.source);
  const writerState = useStore((s) => s.writerState);
  const writerBlocked = useStore((s) => s.writerBlocked);
  const writerEcho = useStore((s) => s.writerEcho);
  const setWriterState = useStore((s) => s.setWriterState);
  const syncWriterFromSource = useStore((s) => s.syncWriterFromSource);
  const setWriterMode = useStore((s) => s.setWriterMode);
  const setWriterFocusScene = useStore((s) => s.setWriterFocusScene);

  // Re-import whenever the source changed and it was not this pane that
  // changed it: a story loaded from IndexedDB, an example, an AI insertion, or
  // an edit made in code mode.
  useEffect(() => {
    if (source !== writerEcho) syncWriterFromSource();
  }, [source, writerEcho, syncWriterFromSource]);

  // First mount, before anything has been loaded or typed: nothing has changed
  // relative to the echo, so the effect above will not fire and the pane would
  // sit on "جارٍ فتح قصتك…" forever.
  useEffect(() => {
    const s = useStore.getState();
    if (s.writerState === null && s.writerBlocked === null) syncWriterFromSource();
  }, [syncWriterFromSource]);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const update = useCallback(
    (fn: (draft: WriterState) => WriterState) => {
      const current = useStore.getState().writerState;
      if (!current) return;
      setWriterState(fn(current));
    },
    [setWriterState],
  );

  const patchScene = useCallback(
    (id: string, next: Scene) => update((s) => ({ ...s, scenes: s.scenes.map((sc) => (sc.id === id ? next : sc)) })),
    [update],
  );

  /** Add a scene and return its id, so a dropdown can select it in one click. */
  const createScene = useCallback((): string => {
    const current = useStore.getState().writerState;
    if (!current) return "";
    const scene = emptyScene(nextSceneTitle(current.scenes));
    setWriterState({ ...current, scenes: [...current.scenes, scene] });
    return scene.id;
  }, [setWriterState]);

  const createTag = useCallback((): string | null => {
    const current = useStore.getState().writerState;
    if (!current) return null;
    const name = askName("ما اسم الأثر الجديد؟ (مثلًا: شجاع)", current.tags);
    if (!name) return null;
    if (!current.tags.includes(name)) setWriterState({ ...current, tags: [...current.tags, name] });
    return name;
  }, [setWriterState]);

  const createImage = useCallback((): string | null => {
    const current = useStore.getState().writerState;
    if (!current) return null;
    const names = (current.images ?? []).map((i) => i.name);
    const name = askName("ما اسم الصورة الجديدة؟ (مثلًا: بوابة المدينة)", names);
    if (!name) return null;
    if (!names.includes(name)) {
      setWriterState({ ...current, images: [...(current.images ?? []), { name, description: "" }] });
    }
    return name;
  }, [setWriterState]);

  const setImageDescription = useCallback((name: string, description: string) => {
    const current = useStore.getState().writerState;
    if (!current) return;
    setWriterState({
      ...current,
      images: (current.images ?? []).map((i) => (i.name === name ? { ...i, description } : i)),
    });
  }, [setWriterState]);

  const createCounter = useCallback((): string | null => {
    const current = useStore.getState().writerState;
    if (!current) return null;
    const names = current.counters.map((c) => c.name);
    const name = askName("ما اسم العدّاد الجديد؟ (مثلًا: المكوّنات)", names);
    if (!name) return null;
    if (!names.includes(name)) {
      setWriterState({ ...current, counters: [...current.counters, { name, initial: 0 }] });
    }
    return name;
  }, [setWriterState]);

  // ---- Story is beyond the form -------------------------------------------

  if (writerBlocked) {
    return (
      <div data-writer="visual" data-writer-blocked="" style={{ padding: "1rem", overflow: "auto", blockSize: "100%" }}>
        <div style={warnBox}>
          <p style={{ marginBlockEnd: "0.5rem" }}>{writerBlocked}</p>
          <p style={noteText}>
            المحرّر المرئي يعرض المقاطع والخيارات والآثار والعدّادات. القصة هنا تستخدم
            ما هو أوسع من ذلك، ولن يعرضه هذا المحرّر حتى لا يحذفه.
          </p>
        </div>
        {/* TWO doors, not one.
            This used to offer only "افتح المحرّر النصّي" — a one-way trip:
            once in the advanced mode, coming back re-imported the same story
            and blocked again, and قصة جديدة did not change the mode. Two
            clicks and the author was locked in with no visible way out. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="button" onClick={newStory} style={accentButton}>
            ابدأ قصة جديدة
          </button>
          <button type="button" onClick={() => setWriterMode("code")} style={ghostButton}>
            افتح المحرّر النصّي
          </button>
        </div>
      </div>
    );
  }

  if (!writerState) {
    return <p style={{ ...noteText, padding: "1rem" }}>جارٍ فتح قصتك…</p>;
  }

  const state = writerState;
  const issues = validateWriterState(state);
  const issuesFor = (sceneId: string): WriterIssue[] => issues.filter((i) => i.sceneId === sceneId);

  // ---- Reorder -------------------------------------------------------------

  const moveScene = (from: number, delta: number) => {
    const to = from + delta;
    if (to < 0 || to >= state.scenes.length) return;
    const scenes = [...state.scenes];
    const [moved] = scenes.splice(from, 1);
    scenes.splice(to, 0, moved!);
    update((s) => ({ ...s, scenes }));
  };

  const dropScene = () => {
    const from = dragFrom;
    const to = dragOver.current;
    setDragFrom(null);
    dragOver.current = null;
    if (from === null || to === null || from === to) return;
    const scenes = [...state.scenes];
    const [moved] = scenes.splice(from, 1);
    scenes.splice(to, 0, moved!);
    update((s) => ({ ...s, scenes }));
  };

  // ---- Tags and counters ---------------------------------------------------

  const renameTag = (oldName: string) => {
    const name = askName(`الاسم الجديد للأثر "${oldName}"`, state.tags);
    if (!name || name === oldName) return;
    update((s) => ({
      ...s,
      tags: s.tags.map((t) => (t === oldName ? name : t)),
      scenes: s.scenes.map((sc) => ({
        ...sc,
        conditionalTexts: sc.conditionalTexts.map((b) =>
          b.condition.kind === "tag" && b.condition.tag === oldName
            ? { ...b, condition: { ...b.condition, tag: name } }
            : b,
        ),
        choices: sc.choices.map((c) => ({
          ...c,
          setTag: c.setTag === oldName ? name : c.setTag,
          requires:
            c.requires?.kind === "tag" && c.requires.tag === oldName
              ? { ...c.requires, tag: name }
              : c.requires,
        })),
      })),
    }));
  };

  const deleteTag = (name: string) => {
    if (!window.confirm(`سيُحذف الأثر "${name}" من كلّ مكان يستعمله. هل تريد الاستمرار؟`)) return;
    update((s) => ({
      ...s,
      tags: s.tags.filter((t) => t !== name),
      scenes: s.scenes.map((sc) => ({
        ...sc,
        conditionalTexts: sc.conditionalTexts.filter(
          (b) => !(b.condition.kind === "tag" && b.condition.tag === name),
        ),
        choices: sc.choices.map((c) => ({
          ...c,
          setTag: c.setTag === name ? null : c.setTag,
          requires: c.requires?.kind === "tag" && c.requires.tag === name ? null : c.requires,
        })),
      })),
    }));
  };

  const patchCounter = (name: string, next: Counter) =>
    update((s) => ({ ...s, counters: s.counters.map((c) => (c.name === name ? next : c)) }));

  const deleteCounter = (name: string) => {
    if (!window.confirm(`سيُحذف العدّاد "${name}" من كلّ مكان يستعمله. هل تريد الاستمرار؟`)) return;
    update((s) => ({
      ...s,
      counters: s.counters.filter((c) => c.name !== name),
      scenes: s.scenes.map((sc) => ({
        ...sc,
        conditionalTexts: sc.conditionalTexts.filter(
          (b) => !(b.condition.kind === "counter" && b.condition.counter === name),
        ),
        choices: sc.choices.map((c) => ({
          ...c,
          addToCounter: c.addToCounter?.counter === name ? null : c.addToCounter,
          requires:
            c.requires?.kind === "counter" && c.requires.counter === name ? null : c.requires,
        })),
      })),
    }));
  };

  // ---- Render --------------------------------------------------------------

  return (
    <div
      dir="rtl"
      data-writer="visual"
      style={{ blockSize: "100%", overflow: "auto", padding: "1rem", fontFamily: PROSE_FONT }}
    >
      {/* ---- Story front matter ---- */}
      <div style={{ ...card, background: "var(--aq-surface)" }}>
        <div style={{ display: "grid", gap: "0.625rem" }}>
          <div>
            <span style={labelStyle}>عنوان القصة</span>
            <input
              dir="rtl"
              aria-label="عنوان القصة"
              placeholder="اسم قصتك"
              value={state.title}
              onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
              style={{ ...input, fontFamily: PROSE_FONT, fontSize: "1.0625rem", fontWeight: 700 }}
            />
          </div>
          <div>
            <span style={labelStyle}>المؤلف</span>
            <input
              dir="rtl"
              aria-label="المؤلف"
              placeholder="اسمك"
              value={state.author}
              onChange={(e) => update((s) => ({ ...s, author: e.target.value }))}
              style={{ ...input, fontFamily: PROSE_FONT }}
            />
          </div>
        </div>
      </div>

      {issues.length > 0 && (
        <div style={warnBox} data-writer-issues={issues.length}>
          يحتاج انتباهك: {issues.length === 1 ? "ملاحظة واحدة" : `${issues.length} ملاحظة`} داخل المقاطع أدناه.
        </div>
      )}

      {/* ---- Scenes ---- */}
      {state.scenes.map((scene, i) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          index={i}
          isFirst={i === 0}
          isLast={i === state.scenes.length - 1}
          scenes={state.scenes}
          tags={state.tags}
          counters={state.counters}
          images={state.images}
          imageStyle={state.imageStyle}
          characters={state.characters}
          onCreateImage={createImage}
          onImageDescription={setImageDescription}
          issues={issuesFor(scene.id)}
          onFocus={() => setWriterFocusScene(scene.id)}
          onChange={(next) => patchScene(scene.id, next)}
          onDelete={() => {
            if (!window.confirm(`سيُحذف المقطع "${scene.title || "دون اسم"}" وكلّ خياراته. هل تريد الاستمرار؟`)) return;
            update((s) => ({
              ...s,
              scenes: s.scenes
                .filter((sc) => sc.id !== scene.id)
                .map((sc) => ({
                  ...sc,
                  autoDivert: sc.autoDivert === scene.id ? null : sc.autoDivert,
                  choices: sc.choices.map((c) => ({
                    ...c,
                    destination: c.destination === scene.id ? null : c.destination,
                  })),
                })),
            }));
          }}
          onMove={(delta) => moveScene(i, delta)}
          onDragStart={() => setDragFrom(i)}
          onDragOver={() => { dragOver.current = i; }}
          onDragEnd={dropScene}
          onCreateScene={createScene}
          onCreateTag={createTag}
          onCreateCounter={createCounter}
          addChoice={() => patchScene(scene.id, { ...scene, choices: [...scene.choices, emptyChoice()] })}
          addConditionalText={() =>
            patchScene(scene.id, {
              ...scene,
              conditionalTexts: [...scene.conditionalTexts, emptyConditionalText(state.tags[0] ?? null)],
            })
          }
        />
      ))}

      <button
        type="button"
        onClick={createScene}
        style={{ ...accentButton, inlineSize: "100%", minBlockSize: "44px" }}
      >
        ＋ أضف مقطعًا
      </button>

      {/* ---- Advanced: tags and counters ---- */}
      <details style={{ marginBlockStart: "1.5rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.875rem", color: "var(--aq-muted)", minBlockSize: "36px" }}>
          الآثار والعدّادات
        </summary>

        <div style={{ ...card, marginBlockStart: "0.75rem" }}>
          <p style={noteText}>
            الأثر يُرفع مرّة واحدة ويبقى مرفوعًا: يعرف القارئ السرّ أو لا يعرفه.
            والعدّاد رقم يزيد كلّما اختار القارئ شيئًا.
          </p>

          <h3 style={{ ...labelStyle, marginBlockStart: "0.875rem", fontSize: "0.8125rem", fontWeight: 700 }}>الآثار</h3>
          {state.tags.length === 0 && <p style={noteText}>لا آثار بعد.</p>}
          {state.tags.map((tag) => (
            <div key={tag} style={{ ...row, marginBlockStart: "0.375rem" }}>
              <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--aq-text)" }}>{tag}</span>
              <button type="button" onClick={() => renameTag(tag)} style={ghostButton}>غيّر الاسم</button>
              <button type="button" onClick={() => deleteTag(tag)} style={dangerButton}>احذف</button>
            </div>
          ))}
          <div style={row}>
            <button type="button" onClick={createTag} style={ghostButton}>＋ أضف أثرًا</button>
          </div>

          <h3 style={{ ...labelStyle, marginBlockStart: "1rem", fontSize: "0.8125rem", fontWeight: 700 }}>العدّادات</h3>
          {state.counters.length === 0 && <p style={noteText}>لا عدّادات بعد.</p>}
          {state.counters.map((counter) => (
            <div key={counter.name} style={{ ...row, marginBlockStart: "0.375rem" }}>
              <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--aq-text)" }}>{counter.name}</span>
              <span style={{ ...labelStyle, marginBlockEnd: 0 }}>يبدأ من</span>
              <input
                type="number"
                aria-label={`قيمة ${counter.name} في البداية`}
                value={counter.initial}
                onChange={(e) => patchCounter(counter.name, { ...counter, initial: Number(e.target.value) || 0 })}
                style={{ ...input, inlineSize: "5rem", direction: "ltr", textAlign: "center" }}
              />
              <button type="button" onClick={() => deleteCounter(counter.name)} style={dangerButton}>احذف</button>
            </div>
          ))}
          <div style={row}>
            <button type="button" onClick={createCounter} style={ghostButton}>＋ أضف عدّادًا</button>
          </div>

          <h3 style={{ ...labelStyle, marginBlockStart: "1rem", fontSize: "0.8125rem", fontWeight: 700 }}>أسلوب الصور</h3>
          <p style={noteText}>
            سطر واحد للقصة كلّها، يُضاف إلى كلّ صورة كما هو. دونه يخترع النموذج أسلوبًا
            مختلفًا لكلّ صورة، فتخرج عشر صور كأنّ عشرة رسّامين رسموها.
          </p>
          <input
            dir="rtl"
            aria-label="أسلوب الصور"
            placeholder="مثال: رسم كتب أطفال، ألوان ترابية"
            value={state.imageStyle}
            onChange={(e) => update((s) => ({ ...s, imageStyle: e.target.value }))}
            style={{ ...input, fontFamily: PROSE_FONT, marginBlockStart: "0.375rem" }}
          />

          <h3 style={{ ...labelStyle, marginBlockStart: "1rem", fontSize: "0.8125rem", fontWeight: 700 }}>أوصاف الشخصيات</h3>
          <p style={noteText}>
            سطر لكلّ شخصية: الاسم ثمّ وصفه. يصل الوصف إلى كلّ صورة تظهر فيها الشخصية،
            فيبقى الوجه نفسه في المقاطع كلّها. دونه يرسم النموذج الشخصية من نصّ المقطع
            وحده، فيخرج الصبيّ شيخًا في الصورة التالية.
          </p>
          <AutoTextarea
            ariaLabel="أوصاف الشخصيات"
            placeholder="مثال: سليم: صبيّ في العاشرة، شعر أسود قصير، قميص أزرق"
            value={state.characters}
            onChange={(characters) => update((s) => ({ ...s, characters }))}
            minRows={2}
            style={{ fontFamily: PROSE_FONT, marginBlockStart: "0.375rem" }}
          />
        </div>
      </details>

      <p style={{ ...noteText, marginBlockStart: "1.5rem", marginBlockEnd: "2rem" }}>
        تريد رؤية اللغة نفسها؟ الإعدادات ⚙️ ← وضع المحرّر ← متقدّم.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One scene — the unit an author thinks in.
//
// The border colour says what the scene is at a glance, and reuses the canvas
// node palette so the same story looks the same in both panes: green = the
// scene the reader starts in, red = a scene the story ends in, plain otherwise.
// ---------------------------------------------------------------------------

import type { Counter, Scene } from "../../lib/writer-model.js";
import { describeProseFixes } from "../../lib/generate-qalam.js";
import type { WriterIssue } from "../../lib/generate-qalam.js";
import AutoTextarea from "./AutoTextarea.js";
import ChoiceCard from "./ChoiceCard.js";
import ConditionalTextCard from "./ConditionalTextCard.js";
import { DestinationSelect } from "./WriterControls.js";
import {
  card,
  checkboxRow,
  dangerButton,
  ghostButton,
  iconButton,
  input,
  label as labelStyle,
  noteText,
  PROSE_FONT,
  row,
} from "./writer-ui.js";

interface Props {
  scene: Scene;
  index: number;
  onFocus: () => void;
  isFirst: boolean;
  isLast: boolean;
  scenes: Scene[];
  tags: string[];
  counters: Counter[];
  issues: WriterIssue[];
  onChange: (next: Scene) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onCreateScene: () => string;
  onCreateTag: () => string | null;
  onCreateCounter: () => string | null;
  addChoice: () => void;
  addConditionalText: () => void;
}

export default function SceneCard({
  scene,
  index,
  onFocus,
  isFirst,
  isLast,
  scenes,
  tags,
  counters,
  issues,
  onChange,
  onDelete,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onCreateScene,
  onCreateTag,
  onCreateCounter,
  addChoice,
  addConditionalText,
}: Props) {
  const set = (patch: Partial<Scene>) => onChange({ ...scene, ...patch });
  const endsHere = scene.choices.length === 0 && scene.isEnding;
  const sceneIssues = issues.filter((i) => !i.choiceId).map((i) => i.message);
  const proseNotes = describeProseFixes(scene.prose);

  const accent = isFirst
    ? "var(--aq-node-green)"
    : endsHere
      ? "var(--aq-node-red)"
      : "var(--aq-border)";

  return (
    <section
      data-writer-scene={scene.id}
      aria-label={scene.title || `مقطع ${index + 1}`}
      onFocusCapture={onFocus}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); onDragEnd(); }}
      style={{ ...card, borderColor: accent, borderInlineStartWidth: "4px" }}
    >
      {/* ---- Header: handle, name, order, delete ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        {/* A drag affordance, not a control: it carries no role and no tab
            stop, because HTML5 drag never fires from a finger and ▲ ▼ below
            are the reorder controls that work everywhere. `index.css` hides it
            outright under 640px. */}
        <span
          data-writer-drag-handle=""
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          aria-hidden="true"
          title="اسحب لتغيير الترتيب"
          style={{ ...iconButton, cursor: "grab", minInlineSize: "32px" }}
        >
          ⣿
        </span>
        <input
          dir="rtl"
          aria-label={`اسم المقطع ${index + 1}`}
          placeholder="اسم المقطع"
          value={scene.title}
          onChange={(e) => set({ title: e.target.value })}
          style={{ ...input, flex: 1, fontFamily: PROSE_FONT, fontWeight: 600, fontSize: "1rem" }}
        />
        {isFirst && <span style={{ ...noteText, color: "var(--aq-node-green)", whiteSpace: "nowrap" }}>يبدأ هنا</span>}
        <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="حرّك المقطع للأعلى" title="للأعلى" style={iconButton}>▲</button>
        <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="حرّك المقطع للأسفل" title="للأسفل" style={iconButton}>▼</button>
        <button type="button" onClick={onDelete} aria-label={`احذف المقطع ${index + 1}`} title="احذف المقطع" style={dangerButton}>✕</button>
      </div>

      {sceneIssues.length > 0 && (
        <ul style={{ ...noteText, color: "var(--aq-warning)", marginBlock: "0.5rem", paddingInlineStart: "1.25rem" }}>
          {sceneIssues.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}

      {/* ---- Prose ---- */}
      <div style={{ marginBlockStart: "0.75rem" }}>
        <AutoTextarea
          ariaLabel={`نصّ المقطع ${index + 1}`}
          placeholder="اكتب ما يقرأه القارئ هنا…"
          minRows={3}
          value={scene.prose}
          onChange={(prose) => set({ prose })}
          style={{ fontSize: "1rem" }}
        />
        {proseNotes.map((n) => (
          <p key={n} style={{ ...noteText, color: "var(--aq-warning)", marginBlockStart: "0.25rem" }}>{n}</p>
        ))}
      </div>

      {/* ---- Conditional text ---- */}
      {scene.conditionalTexts.map((block, i) => (
        <ConditionalTextCard
          key={block.id}
          block={block}
          index={i}
          tags={tags}
          counters={counters}
          onCreateTag={onCreateTag}
          onCreateCounter={onCreateCounter}
          onChange={(next) => set({
            conditionalTexts: scene.conditionalTexts.map((b) => (b.id === block.id ? next : b)),
          })}
          onDelete={() => set({
            conditionalTexts: scene.conditionalTexts.filter((b) => b.id !== block.id),
          })}
        />
      ))}

      {/* ---- Choices ---- */}
      {scene.choices.map((choice, i) => (
        <ChoiceCard
          key={choice.id}
          choice={choice}
          index={i}
          scenes={scenes}
          tags={tags}
          counters={counters}
          problems={issues.filter((is) => is.choiceId === choice.id).map((is) => is.message)}
          onCreateScene={onCreateScene}
          onCreateTag={onCreateTag}
          onCreateCounter={onCreateCounter}
          onChange={(next) => set({ choices: scene.choices.map((c) => (c.id === choice.id ? next : c)) })}
          onDelete={() => set({ choices: scene.choices.filter((c) => c.id !== choice.id) })}
        />
      ))}

      {/* ---- Where the story goes when there is nothing to click ---- */}
      {scene.choices.length === 0 && (
        <div style={row}>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={scene.isEnding}
              onChange={(e) => set({ isEnding: e.target.checked, autoDivert: e.target.checked ? null : scene.autoDivert })}
            />
            تنتهي القصة هنا
          </label>
          {!scene.isEnding && (
            <>
              <span style={{ ...labelStyle, marginBlockEnd: 0 }}>ينتقل تلقائيًا إلى</span>
              <DestinationSelect
                ariaLabel={`وجهة المقطع ${index + 1}`}
                value={scene.autoDivert}
                scenes={scenes}
                onChange={(autoDivert) => set({ autoDivert })}
                onCreateScene={onCreateScene}
              />
            </>
          )}
        </div>
      )}

      {/* ---- Add ---- */}
      <div style={row}>
        <button type="button" onClick={addChoice} style={ghostButton}>＋ أضف خيارًا</button>
        <button type="button" onClick={addConditionalText} style={ghostButton}>＋ أضف نصًّا مشروطًا</button>
      </div>
    </section>
  );
}

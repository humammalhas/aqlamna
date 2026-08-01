// ---------------------------------------------------------------------------
// The three dropdowns the visual writer is built out of: where a choice goes,
// which tag or counter a rule is about, and the rule itself.
//
// Every one of them is a `<select>` of things that already exist, plus one
// "make a new one" entry. That is the whole no-syntax promise: an author picks
// a destination from a list of their own scene names and never learns that
// `->` exists.
// ---------------------------------------------------------------------------

import {
  COUNTER_OPS,
  END_DESTINATION,
  type Counter,
  type CounterOp,
  type Scene,
  type WriterCondition,
} from "../../lib/writer-model.js";
import { label as labelStyle, row, select } from "./writer-ui.js";

const NEW = "__جديد__";
const NONE = "";

/** A scene with no title yet still needs a readable entry in the list. */
function sceneLabel(scene: Scene, index: number): string {
  const t = scene.title.trim();
  return t.length > 0 ? t : `مقطع ${index + 1} (دون اسم)`;
}

// ---- Destination -----------------------------------------------------------

interface DestinationProps {
  value: string | null;
  scenes: Scene[];
  onChange: (value: string | null) => void;
  onCreateScene: () => string;
  ariaLabel: string;
}

export function DestinationSelect({
  value,
  scenes,
  onChange,
  onCreateScene,
  ariaLabel,
}: DestinationProps) {
  return (
    <select
      aria-label={ariaLabel}
      value={value ?? NONE}
      onChange={(e) => {
        const v = e.target.value;
        if (v === NEW) onChange(onCreateScene());
        else onChange(v === NONE ? null : v);
      }}
      style={select}
    >
      <option value={NONE}>اختر المقطع…</option>
      {scenes.map((s, i) => (
        <option key={s.id} value={s.id}>{sceneLabel(s, i)}</option>
      ))}
      <option value={END_DESTINATION}>نهاية القصة</option>
      <option value={NEW}>＋ مقطع جديد</option>
    </select>
  );
}

// ---- Condition -------------------------------------------------------------

interface ConditionProps {
  value: WriterCondition | null;
  tags: string[];
  counters: Counter[];
  onChange: (value: WriterCondition | null) => void;
  onCreateTag: () => string | null;
  onCreateCounter: () => string | null;
  /** false on a conditional-text block, where "no condition" makes no sense. */
  allowNone?: boolean;
  labelText: string;
}

type Kind = "none" | "tag" | "counter";

export function ConditionEditor({
  value,
  tags,
  counters,
  onChange,
  onCreateTag,
  onCreateCounter,
  allowNone = true,
  labelText,
}: ConditionProps) {
  const kind: Kind = value === null ? "none" : value.kind;

  const setKind = (next: Kind) => {
    if (next === "none") { onChange(null); return; }
    if (next === "tag") {
      const tag = tags[0] ?? onCreateTag();
      if (!tag) return;
      onChange({ kind: "tag", tag, present: true });
      return;
    }
    const counter = counters[0]?.name ?? onCreateCounter();
    if (!counter) return;
    onChange({ kind: "counter", counter, op: ">=", value: 1 });
  };

  return (
    <div>
      <span style={labelStyle}>{labelText}</span>
      <div style={{ ...row, marginBlockStart: 0 }}>
        <select
          aria-label={labelText}
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          style={select}
        >
          {allowNone && <option value="none">دون شرط</option>}
          <option value="tag">أثر</option>
          <option value="counter">عدّاد</option>
        </select>

        {value?.kind === "tag" && (
          <>
            <select
              aria-label="اسم الأثر"
              value={value.tag}
              onChange={(e) => {
                const v = e.target.value;
                if (v === NEW) {
                  const created = onCreateTag();
                  if (created) onChange({ ...value, tag: created });
                  return;
                }
                onChange({ ...value, tag: v });
              }}
              style={select}
            >
              {!tags.includes(value.tag) && <option value={value.tag}>{value.tag || "—"}</option>}
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={NEW}>＋ أثر جديد</option>
            </select>
            <select
              aria-label="حالة الأثر"
              value={value.present ? "yes" : "no"}
              onChange={(e) => onChange({ ...value, present: e.target.value === "yes" })}
              style={select}
            >
              <option value="yes">موجود</option>
              <option value="no">غير موجود</option>
            </select>
          </>
        )}

        {value?.kind === "counter" && (
          <>
            <select
              aria-label="اسم العدّاد"
              value={value.counter}
              onChange={(e) => {
                const v = e.target.value;
                if (v === NEW) {
                  const created = onCreateCounter();
                  if (created) onChange({ ...value, counter: created });
                  return;
                }
                onChange({ ...value, counter: v });
              }}
              style={select}
            >
              {!counters.some((c) => c.name === value.counter) && (
                <option value={value.counter}>{value.counter || "—"}</option>
              )}
              {counters.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              <option value={NEW}>＋ عدّاد جديد</option>
            </select>
            <select
              aria-label="المقارنة"
              value={value.op}
              onChange={(e) => onChange({ ...value, op: e.target.value as CounterOp })}
              style={select}
            >
              {COUNTER_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            <input
              type="number"
              aria-label="القيمة"
              value={value.value}
              onChange={(e) => onChange({ ...value, value: Number(e.target.value) || 0 })}
              style={{ ...select, minInlineSize: "5rem", direction: "ltr", textAlign: "center" }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---- Free-name prompts -----------------------------------------------------

/**
 * `window.prompt` rather than a custom modal: one keystroke to answer, one to
 * cancel, no focus trap to get wrong, and it already reads the page's language.
 * Returns null when the author cancels or types nothing.
 */
export function askName(message: string, existing: string[]): string | null {
  const answer = window.prompt(message, "");
  if (answer === null) return null;
  const name = answer.trim();
  if (name.length === 0) return null;
  if (existing.includes(name)) return name;
  return name;
}

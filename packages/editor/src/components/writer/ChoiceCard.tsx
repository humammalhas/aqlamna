// ---------------------------------------------------------------------------
// One choice, as a sub-card inside a scene.
//
// The two fields an author always needs — what the reader clicks, and where it
// takes them — are on the surface. Everything else (a tag to raise, a counter
// to add to, a gate, prose after the click) lives behind تفاصيل, because a
// scene with five choices showing eight fields each is a wall, and the walls
// are what made the code editor unusable in the first place.
// ---------------------------------------------------------------------------

import { useState } from "react";
import type { Choice, Counter, Scene } from "../../lib/writer-model.js";
import { describeProseFixes } from "../../lib/generate-qalam.js";
import AutoTextarea from "./AutoTextarea.js";
import { ConditionEditor, DestinationSelect } from "./WriterControls.js";
import {
  checkboxRow,
  dangerButton,
  ghostButton,
  input,
  label as labelStyle,
  noteText,
  row,
  select,
  subCard,
} from "./writer-ui.js";

interface Props {
  choice: Choice;
  index: number;
  scenes: Scene[];
  tags: string[];
  counters: Counter[];
  problems: string[];
  onChange: (next: Choice) => void;
  onDelete: () => void;
  onCreateScene: () => string;
  onCreateTag: () => string | null;
  onCreateCounter: () => string | null;
}

export default function ChoiceCard({
  choice,
  index,
  scenes,
  tags,
  counters,
  problems,
  onChange,
  onDelete,
  onCreateScene,
  onCreateTag,
  onCreateCounter,
}: Props) {
  // Open by default when something about this choice is already unusual, so a
  // gate or a raised tag is never hidden behind a collapsed panel.
  const [open, setOpen] = useState(
    () => choice.requires !== null || choice.setTag !== null || choice.addToCounter !== null,
  );

  const set = (patch: Partial<Choice>) => onChange({ ...choice, ...patch });
  const proseNotes = describeProseFixes(choice.proseAfter);

  return (
    <div style={subCard} data-writer-choice={choice.id}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ ...labelStyle, marginBlockEnd: 0, flexShrink: 0 }}>
          خيار {index + 1}
        </span>
        {/* Indexed, and no accessible name here is a substring of another —
            `getByLabel` matches on substring, so "نصّ الخيار" would resolve to
            every choice in the scene at once. */}
        <input
          dir="rtl"
          aria-label={`نصّ الخيار ${index + 1}`}
          placeholder="ما يقرأه القارئ ويضغط عليه"
          value={choice.label}
          onChange={(e) => set({ label: e.target.value })}
          style={{ ...input, flex: 1 }}
        />
        <button
          type="button"
          onClick={onDelete}
          title="احذف هذا الخيار"
          aria-label={`احذف الخيار ${index + 1}`}
          style={dangerButton}
        >
          ✕
        </button>
      </div>

      <div style={row}>
        <span style={{ ...labelStyle, marginBlockEnd: 0 }}>ينقلك إلى</span>
        <DestinationSelect
          ariaLabel={`وجهة الخيار ${index + 1}`}
          value={choice.destination}
          scenes={scenes}
          onChange={(destination) => set({ destination })}
          onCreateScene={onCreateScene}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={ghostButton}
        >
          {open ? "أخفِ التفاصيل" : "تفاصيل"}
        </button>
      </div>

      {problems.length > 0 && (
        <ul style={{ ...noteText, color: "var(--aq-warning)", marginBlock: "0.5rem", paddingInlineStart: "1.25rem" }}>
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {open && (
        <div style={{ marginBlockStart: "0.75rem", display: "grid", gap: "0.75rem" }}>
          <div>
            <span style={labelStyle}>نصّ يظهر بعد الاختيار (اختياري)</span>
            <AutoTextarea
              ariaLabel={`نصّ بعد الخيار ${index + 1}`}
              placeholder="ما يحدث لحظة الضغط، قبل الانتقال"
              value={choice.proseAfter}
              onChange={(proseAfter) => set({ proseAfter })}
            />
            {proseNotes.map((n) => (
              <p key={n} style={{ ...noteText, color: "var(--aq-warning)", marginBlockStart: "0.25rem" }}>{n}</p>
            ))}
          </div>

          <div style={{ ...row, marginBlockStart: 0 }}>
            <span style={{ ...labelStyle, marginBlockEnd: 0 }}>عند الاختيار</span>
            <select
              aria-label={`أثر الخيار ${index + 1}`}
              value={choice.setTag ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__جديد__") {
                  const created = onCreateTag();
                  if (created) set({ setTag: created });
                  return;
                }
                set({ setTag: v === "" ? null : v });
              }}
              style={select}
            >
              <option value="">دون أثر</option>
              {choice.setTag && !tags.includes(choice.setTag) && (
                <option value={choice.setTag}>{choice.setTag}</option>
              )}
              {tags.map((t) => <option key={t} value={t}>يرفع الأثر: {t}</option>)}
              <option value="__جديد__">＋ أثر جديد</option>
            </select>

            <select
              aria-label={`عدّاد الخيار ${index + 1}`}
              value={choice.addToCounter?.counter ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__جديد__") {
                  const created = onCreateCounter();
                  if (created) set({ addToCounter: { counter: created, amount: 1 } });
                  return;
                }
                set({ addToCounter: v === "" ? null : { counter: v, amount: choice.addToCounter?.amount ?? 1 } });
              }}
              style={select}
            >
              <option value="">دون عدّاد</option>
              {counters.map((c) => <option key={c.name} value={c.name}>يزيد العدّاد: {c.name}</option>)}
              <option value="__جديد__">＋ عدّاد جديد</option>
            </select>

            {choice.addToCounter && (
              <input
                type="number"
                aria-label="مقدار الزيادة"
                value={choice.addToCounter.amount}
                onChange={(e) =>
                  set({ addToCounter: { ...choice.addToCounter!, amount: Number(e.target.value) || 0 } })
                }
                style={{ ...select, minInlineSize: "5rem", direction: "ltr", textAlign: "center" }}
              />
            )}
          </div>

          <ConditionEditor
            labelText="شرط ظهور الخيار"
            value={choice.requires}
            tags={tags}
            counters={counters}
            onChange={(requires) => set({ requires })}
            onCreateTag={onCreateTag}
            onCreateCounter={onCreateCounter}
          />

          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={choice.consumable}
              onChange={(e) => set({ consumable: e.target.checked })}
            />
            يختفي بعد اختياره مرّة واحدة
          </label>
        </div>
      )}
    </div>
  );
}

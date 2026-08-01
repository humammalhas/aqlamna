// ---------------------------------------------------------------------------
// A block of prose that only some readers see.
//
// Bordered blue, matching the canvas's own blue, so a glance down a scene tells
// prose (plain) from conditional prose (framed) without reading either.
// ---------------------------------------------------------------------------

import type { ConditionalText, Counter } from "../../lib/writer-model.js";
import { describeProseFixes } from "../../lib/generate-qalam.js";
import AutoTextarea from "./AutoTextarea.js";
import { ConditionEditor } from "./WriterControls.js";
import { dangerButton, label as labelStyle, noteText, subCard } from "./writer-ui.js";

interface Props {
  block: ConditionalText;
  index: number;
  tags: string[];
  counters: Counter[];
  onChange: (next: ConditionalText) => void;
  onDelete: () => void;
  onCreateTag: () => string | null;
  onCreateCounter: () => string | null;
}

export default function ConditionalTextCard({
  block,
  index,
  tags,
  counters,
  onChange,
  onDelete,
  onCreateTag,
  onCreateCounter,
}: Props) {
  const notes = describeProseFixes(block.text);

  return (
    <div
      style={{
        ...subCard,
        borderColor: "var(--aq-node-blue)",
        background: "var(--aq-node-blue-bg)",
      }}
      data-writer-conditional={block.id}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ ...labelStyle, marginBlockEnd: 0 }}>نصّ مشروط {index + 1}</span>
        <button
          type="button"
          onClick={onDelete}
          title="احذف هذا النصّ"
          // Not "احذف النصّ المشروط N": that string CONTAINS the textarea's own
          // label, and `getByLabel` matches substrings, so the two controls
          // became indistinguishable to a test and to a screen-reader search.
          aria-label={`احذف الكتلة المشروطة ${index + 1}`}
          style={dangerButton}
        >
          ✕
        </button>
      </div>

      <div style={{ marginBlockStart: "0.5rem" }}>
        <span style={labelStyle}>اعرض هذا النصّ</span>
        <AutoTextarea
          ariaLabel={`النصّ المشروط ${index + 1}`}
          placeholder="نصّ يقرأه من ينطبق عليه الشرط وحده"
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
        />
        {notes.map((n) => (
          <p key={n} style={{ ...noteText, color: "var(--aq-warning)", marginBlockStart: "0.25rem" }}>{n}</p>
        ))}
      </div>

      <div style={{ marginBlockStart: "0.625rem" }}>
        <ConditionEditor
          labelText="فقط إذا"
          allowNone={false}
          value={block.condition}
          tags={tags}
          counters={counters}
          onChange={(condition) => { if (condition) onChange({ ...block, condition }); }}
          onCreateTag={onCreateTag}
          onCreateCounter={onCreateCounter}
        />
      </div>
    </div>
  );
}

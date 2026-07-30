// ---------------------------------------------------------------------------
// PassageNode — custom React Flow node for a .qalam passage card.
// RTL: source handle on LEFT (inline-end), target handle on RIGHT (inline-start),
// mirrored from React Flow's LTR default per design §7.1.
// Double-click the title to rename the passage (updates header + all references).
// ---------------------------------------------------------------------------

import { memo, useCallback, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { PassageNodeData } from "../lib/canvas-parser.js";
import { renamePassage } from "../lib/canvas-edit.js";
import { useStore } from "../store.js";

// Colour map for borders
const COLOUR_MAP: Record<string, string> = {
  green: "var(--aq-node-green)",
  red: "var(--aq-node-red)",
  orange: "var(--aq-node-orange)",
  blue: "var(--aq-node-blue)",
};

const COLOUR_BG: Record<string, string> = {
  green: "var(--aq-node-green-bg)",
  red: "var(--aq-danger-bg)",
  orange: "var(--aq-danger-bg)",
  blue: "var(--aq-node-blue-bg)",
};

// Default for ghost nodes
const GHOST_BORDER = "var(--aq-danger)";

function PassageNode({ data, selected }: NodeProps) {
  const d = data as unknown as PassageNodeData;
  const isGhost = d.preview === "⚠️ مقطع غير موجود";
  const borderColor = isGhost ? GHOST_BORDER : COLOUR_MAP[d.colour] ?? COLOUR_MAP.blue;
  const bgColor = isGhost ? "var(--aq-danger-bg)" : COLOUR_BG[d.colour] ?? COLOUR_BG.blue;

  // Inline rename state
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Store access for rename
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);

  // Double-click title → enter rename mode
  const handleTitleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isGhost) return;
      e.stopPropagation();
      setEditValue(d.title);
      setEditing(true);
      // Focus the input after render
      setTimeout(() => inputRef.current?.select(), 0);
    },
    [isGhost, d.title],
  );

  // Commit rename
  const commitRename = useCallback(() => {
    setEditing(false);
    const newName = editValue.trim();
    if (!newName || newName === d.title) return;
    const newSource = renamePassage(source, d.title, newName);
    if (newSource !== source) {
      setSource(newSource);
    }
  }, [editValue, d.title, source, setSource]);

  // Key handling for rename input
  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitRename();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [commitRename],
  );

  return (
    <div
      style={{
        direction: "rtl",
        textAlign: "right",
        minWidth: "180px",
        maxWidth: "240px",
        backgroundColor: bgColor,
        border: `2px ${isGhost ? "dashed" : "solid"} ${borderColor}`,
        borderRadius: "8px",
        padding: "0.625rem 0.75rem",
        fontSize: "0.8125rem",
        color: "var(--aq-border-hi)",
        fontFamily: "system-ui, sans-serif",
        boxShadow: selected
          ? `0 0 0 2px ${borderColor}`
          : "0 2px 6px rgba(0,0,0,0.3)",
        opacity: isGhost ? 0.7 : 1,
        position: "relative",
      }}
    >
      {/* Source handle — LEFT side of card (inline-end in RTL) */}
      <Handle
        type="source"
        position={Position.Left}
        id="source"
        style={{
          background: borderColor,
          inlineSize: "10px",
          blockSize: "10px",
          border: "2px solid var(--aq-surface)",
        }}
      />

      {/* Target handle — RIGHT side of card (inline-start in RTL) */}
      <Handle
        type="target"
        position={Position.Right}
        id="target"
        style={{
          background: borderColor,
          inlineSize: "10px",
          blockSize: "10px",
          border: "2px solid var(--aq-surface)",
        }}
      />

      {/* Title — double-click to rename */}
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKeyDown}
          style={{
            fontWeight: 700,
            fontSize: "0.9375rem",
            color: "var(--aq-accent)",
            backgroundColor: "var(--aq-input-bg)",
            border: `1px solid ${borderColor}`,
            borderRadius: "4px",
            padding: "2px 6px",
            width: "100%",
            boxSizing: "border-box",
            marginBlockEnd: "0.25rem",
            fontFamily: "inherit",
            direction: "rtl",
            textAlign: "right",
          }}
          autoFocus
        />
      ) : (
        <div
          onDoubleClick={handleTitleDoubleClick}
          style={{
            fontWeight: 700,
            fontSize: "0.9375rem",
            color: isGhost ? "var(--aq-danger)" : "var(--aq-accent)",
            marginBlockEnd: "0.25rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            cursor: isGhost ? "default" : "text",
            userSelect: "none",
          }}
          title={isGhost ? undefined : "انقر نقراً مزدوجاً لإعادة التسمية"}
        >
          {d.isStart ? "▶ " : ""}
          {d.title}
        </div>
      )}

      {/* Preview */}
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--aq-muted)",
          lineHeight: 1.6,
          marginBlockEnd: "0.375rem",
          maxHeight: "2.6em",
          overflow: "hidden",
        }}
      >
        {d.preview}
      </div>

      {/* Badges row */}
      <div
        style={{
          display: "flex",
          gap: "0.375rem",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {d.choiceCount > 0 && (
          <span
            style={{
              fontSize: "0.6875rem",
              color: "var(--aq-syn-divert)",
              backgroundColor: "var(--aq-bg-deep)",
              padding: "1px 6px",
              borderRadius: "10px",
              border: "1px solid var(--aq-warning-bg)",
            }}
          >
            {d.choiceCount} ↯
          </span>
        )}
        {d.hasConditions && (
          <span
            style={{
              fontSize: "0.6875rem",
              color: "var(--aq-accent-muted)",
              backgroundColor: "var(--aq-bg-deep)",
              padding: "1px 6px",
              borderRadius: "10px",
              border: "1px solid var(--aq-node-red)",
            }}
          >
            ؟
          </span>
        )}
        {d.hasEndDivert && (
          <span
            style={{
              fontSize: "0.6875rem",
              color: "var(--aq-danger)",
              backgroundColor: "var(--aq-bg-deep)",
              padding: "1px 6px",
              borderRadius: "10px",
              border: "1px solid var(--aq-error-bg)",
            }}
          >
            ⏹
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(PassageNode);

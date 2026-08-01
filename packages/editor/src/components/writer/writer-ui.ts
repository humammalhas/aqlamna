// ---------------------------------------------------------------------------
// Visual Writer — shared styles.
//
// Every colour is a CSS variable (`lint:colors` fails the build on a literal
// hex), and every box measurement is a logical property, so the whole pane
// mirrors with `direction: rtl` and nothing is pinned to "left".
//
// The type face is deliberately NOT the monospace stack the code editor uses.
// This surface is for writing prose, and a writer reading their own sentence in
// Cascadia Code is being told, wordlessly, that they are programming.
// ---------------------------------------------------------------------------

import type { CSSProperties } from "react";

export const PROSE_FONT =
  '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Segoe UI", system-ui, sans-serif';

export const card: CSSProperties = {
  border: "1px solid var(--aq-border)",
  borderRadius: "10px",
  background: "var(--aq-surface-hi)",
  padding: "0.875rem",
  marginBlockEnd: "1rem",
};

export const subCard: CSSProperties = {
  border: "1px solid var(--aq-border)",
  borderRadius: "8px",
  background: "var(--aq-bg)",
  padding: "0.75rem",
  marginBlockStart: "0.625rem",
};

export const input: CSSProperties = {
  inlineSize: "100%",
  boxSizing: "border-box",
  paddingBlock: "0.5rem",
  paddingInline: "0.625rem",
  fontSize: "0.9375rem",
  fontFamily: PROSE_FONT,
  color: "var(--aq-input-text)",
  background: "var(--aq-input-bg)",
  border: "1px solid var(--aq-input-border)",
  borderRadius: "6px",
  outline: "none",
};

export const textarea: CSSProperties = {
  ...input,
  lineHeight: 1.8,
  resize: "none",
  overflow: "hidden",
  minBlockSize: "3.5rem",
};

export const select: CSSProperties = {
  ...input,
  inlineSize: "auto",
  minInlineSize: "9rem",
  paddingBlock: "0.375rem",
  appearance: "auto",
};

export const label: CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  color: "var(--aq-dim)",
  marginBlockEnd: "0.25rem",
};

export const row: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.5rem",
  marginBlockStart: "0.5rem",
};

export const ghostButton: CSSProperties = {
  minBlockSize: "36px",
  paddingBlock: "0.375rem",
  paddingInline: "0.625rem",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
  color: "var(--aq-muted)",
  background: "transparent",
  border: "1px solid var(--aq-border)",
  borderRadius: "6px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const accentButton: CSSProperties = {
  ...ghostButton,
  fontWeight: 600,
  color: "var(--aq-btn-accent-text)",
  background: "var(--aq-btn-accent-bg)",
  border: "none",
};

export const dangerButton: CSSProperties = {
  ...ghostButton,
  minInlineSize: "36px",
  color: "var(--aq-danger)",
  borderColor: "var(--aq-btn-danger-border)",
};

/**
 * Icon buttons carry a real 44px touch target. The phone sweep on 31 Jul found
 * controls the thumb could not hit; there is no reason to relearn that.
 */
export const iconButton: CSSProperties = {
  minInlineSize: "44px",
  minBlockSize: "44px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1rem",
  fontFamily: "inherit",
  color: "var(--aq-muted)",
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: "6px",
  cursor: "pointer",
};

export const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  paddingBlock: "0.125rem",
  paddingInline: "0.5rem",
  fontSize: "0.75rem",
  borderRadius: "999px",
  background: "var(--aq-node-blue-bg)",
  color: "var(--aq-accent)",
  border: "1px solid var(--aq-node-blue)",
};

export const noteText: CSSProperties = {
  fontSize: "0.75rem",
  lineHeight: 1.7,
  color: "var(--aq-dim)",
};

export const warnBox: CSSProperties = {
  padding: "0.625rem 0.75rem",
  fontSize: "0.8125rem",
  lineHeight: 1.8,
  color: "var(--aq-warning)",
  background: "var(--aq-warning-bg)",
  border: "1px solid var(--aq-border)",
  borderRadius: "8px",
  marginBlockEnd: "1rem",
};

export const checkboxRow: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  fontSize: "0.8125rem",
  color: "var(--aq-muted)",
  cursor: "pointer",
  minBlockSize: "36px",
};

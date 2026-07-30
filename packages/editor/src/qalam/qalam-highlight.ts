// ---------------------------------------------------------------------------
// .qalam syntax highlight colours — dark theme, high contrast Arabic prose.
// ---------------------------------------------------------------------------

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * CodeMirror 6 HighlightStyle for .qalam.
 * Prose stays unstyled (inherits editor foreground colour) — it's the
 * majority of the document and must read comfortably.
 */
export const qalamHighlightStyle = HighlightStyle.define([
  // Passage headers & subsections — gold, bold
  { tag: tags.heading, color: "var(--aq-accent)", fontWeight: "bold" },

  // Keywords (متغير، قائمة، نهاية، etc.) — cyan
  { tag: tags.keyword, color: "var(--aq-syn-var)" },

  // Choice markers (* + ** +*) — green-gold
  { tag: tags.strong, color: "var(--aq-syn-string)" },

  // Choice labels [النص] — muted green
  { tag: tags.labelName, color: "var(--aq-syn-comment)" },

  // Diverts (-> ->->) — orange
  { tag: tags.controlKeyword, color: "var(--aq-syn-choice)" },

  // Assignments (~) — orange
  { tag: tags.definitionOperator, color: "var(--aq-syn-choice)" },

  // Brackets / braces — subtle gray
  { tag: tags.bracket, color: "var(--aq-muted)" },

  // Interpolation {var} — yellow
  { tag: tags.variableName, color: "var(--aq-syn-divert)" },

  // Comments — muted gray
  { tag: tags.comment, color: "var(--aq-node-muted)", fontStyle: "italic" },

  // Tags (#tag) — purple
  { tag: tags.labelName, color: "var(--aq-syn-keyword)" },

  // Strings — warm yellow-green
  { tag: tags.string, color: "var(--aq-syn-string)" },

  // Numbers — orange (both Arabic-Indic and Western)
  { tag: tags.number, color: "var(--aq-syn-choice)" },

  // Booleans (صح/خطأ) — cyan
  { tag: tags.bool, color: "var(--aq-syn-var)" },

  // Front matter (عنوان: etc.) — light blue
  { tag: tags.meta, color: "var(--aq-syn-comment)" },
]);

/**
 * Extension that applies the .qalam highlight style.
 */
export const qalamHighlighting = syntaxHighlighting(qalamHighlightStyle);

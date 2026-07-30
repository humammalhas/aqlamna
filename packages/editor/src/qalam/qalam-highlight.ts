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
  { tag: tags.heading, color: "#d4a843", fontWeight: "bold" },

  // Keywords (متغير، قائمة، نهاية، etc.) — cyan
  { tag: tags.keyword, color: "#56b6c2" },

  // Choice markers (* + ** +*) — green-gold
  { tag: tags.strong, color: "#98c379" },

  // Choice labels [النص] — muted green
  { tag: tags.labelName, color: "#7ea87e" },

  // Diverts (-> ->->) — orange
  { tag: tags.controlKeyword, color: "#d19a66" },

  // Assignments (~) — orange
  { tag: tags.definitionOperator, color: "#d19a66" },

  // Brackets / braces — subtle gray
  { tag: tags.bracket, color: "#8a8a7a" },

  // Interpolation {var} — yellow
  { tag: tags.variableName, color: "#e5c07b" },

  // Comments — muted gray
  { tag: tags.comment, color: "#5c6370", fontStyle: "italic" },

  // Tags (#tag) — purple
  { tag: tags.labelName, color: "#c678dd" },

  // Strings — warm yellow-green
  { tag: tags.string, color: "#98c379" },

  // Numbers — orange (both Arabic-Indic and Western)
  { tag: tags.number, color: "#d19a66" },

  // Booleans (صح/خطأ) — cyan
  { tag: tags.bool, color: "#56b6c2" },

  // Front matter (عنوان: etc.) — light blue
  { tag: tags.meta, color: "#61afef" },
]);

/**
 * Extension that applies the .qalam highlight style.
 */
export const qalamHighlighting = syntaxHighlighting(qalamHighlightStyle);

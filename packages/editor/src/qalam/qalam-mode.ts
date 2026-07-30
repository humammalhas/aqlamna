// ---------------------------------------------------------------------------
// .qalam StreamLanguage mode for CodeMirror 6.
//
// Tokenises .qalam source into semantic tokens: headers, choices, diverts,
// keywords, conditionals, comments, tags, and prose. Prose is always unstyled.
// Returns standard Lezer highlight tag names directly.
// ---------------------------------------------------------------------------

import { StreamLanguage } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";

// ---- Token type constants (standard Lezer tag names) -----------------------

const TAG = {
  heading: "heading",
  keyword: "keyword",
  strong: "strong",
  labelName: "labelName",
  controlKeyword: "controlKeyword",
  definitionOperator: "definitionOperator",
  bracket: "bracket",
  /** variableName for interpolations like {var} */
  variableName: "variableName",
  comment: "comment",
  meta: "meta",
  string: "string",
  number: "number",
  bool: "bool",
};

// ---- Keywords --------------------------------------------------------------

const KEYWORDS = new Set([
  // Arabic
  "متغير", "قائمة", "صح", "خطأ", "نهاية", "تابع", "غير_ذلك",
  // English aliases
  "var", "list", "true", "false", "END", "DONE", "else",
  // Front matter
  "عنوان", "TITLE", "مؤلف", "AUTHOR", "لغة", "LANGUAGE",
]);

const FRONT_MATTER_KEYS = new Set([
  "عنوان:", "TITLE:", "مؤلف:", "AUTHOR:", "لغة:", "LANGUAGE:",
]);

// ---- Stream parser ---------------------------------------------------------

export const qalamLanguage = StreamLanguage.define({
  name: "qalam",

  startState(): null {
    return null;
  },

  token(stream: StringStream): string | null {
    // --- Comments ---
    if (stream.match("//")) {
      stream.skipToEnd();
      return TAG.comment;
    }
    if (stream.match("/*")) {
      while (!stream.eol()) {
        if (stream.match("*/")) break;
        stream.next();
      }
      return TAG.comment;
    }

    // --- Front matter at sol ---
    if (stream.sol()) {
      const peekStart = stream.pos;
      const word = stream.peek() === '"' ? null : readWordAt(stream);
      if (word && FRONT_MATTER_KEYS.has(word + ":")) {
        stream.pos = peekStart;
        stream.eatWhile(/[^\s:]/);
        stream.eat(":");
        return TAG.meta;
      }
      stream.pos = peekStart;
    }

    // --- Start-of-line patterns ---
    if (stream.sol()) {
      stream.eatWhile(/\s/);
      // === passage header ===
      if (stream.match(/^===/)) {
        stream.skipToEnd();
        return TAG.heading;
      }

      // = subsection
      if (stream.match(/^=[^=]/) || stream.match(/^=$/)) {
        stream.skipToEnd();
        return TAG.heading;
      }

      // Choice markers: * , + , ** , +*
      if (stream.match(/^(\*\*|\+\*|[*+])(?=\s|\[)/)) {
        return TAG.strong;
      }

      // Divert: -> or ->->
      if (stream.match(/^->/)) {
        stream.skipToEnd();
        return TAG.controlKeyword;
      }

      // Assignment: ~
      if (stream.match(/^~/)) {
        stream.skipToEnd();
        return TAG.definitionOperator;
      }

      // Variable / list declaration
      if (stream.match(/^(متغير|var|قائمة|list)\b/)) {
        stream.skipToEnd();
        return TAG.keyword;
      }

      // Multi-branch conditional header: {var:
      if (stream.match(/^\{[^}]/)) {
        eatBracketBlock(stream);
        return TAG.bracket;
      }

      // Tag at sol
      if (stream.match(/^#[^\s{]+/)) {
        return TAG.meta;
      }
    }

    // --- Inline patterns ---

    // Interpolation: {var} in prose
    if (stream.match(/^\{[^}\s:]+\}/)) {
      return TAG.variableName;
    }

    // Braces
    if (stream.peek() === "{" || stream.peek() === "}") {
      stream.next();
      return TAG.bracket;
    }

    // Booleans
    if (stream.match(/^(صح|خطأ|true|false)\b/)) {
      return TAG.bool;
    }

    // Numbers
    if (stream.match(/^[0-9٠-٩]+(\.[0-9٠-٩]+)?/)) {
      return TAG.number;
    }

    // String literals
    if (stream.match(/^"/)) {
      while (!stream.eol()) {
        if (stream.next() === '"') break;
      }
      return TAG.string;
    }

    // Inline tag
    if (stream.match(/^#[^\s{]+/)) {
      return TAG.meta;
    }

    // Choice label: [label]
    if (stream.match(/^\[/)) {
      while (!stream.eol()) {
        if (stream.next() === "]") break;
      }
      return TAG.labelName;
    }

    // Keyword or prose word
    if (stream.eatWhile(/[\p{L}_]/u)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return TAG.keyword;
      return null; // prose — unstyled
    }

    // Whitespace, punctuation — unstyled
    stream.next();
    return null;
  },
});

// ---- Helpers ---------------------------------------------------------------

function readWordAt(stream: StringStream): string | null {
  const start = stream.pos;
  let word = "";
  while (stream.pos < stream.string.length) {
    const ch = stream.string[stream.pos]!;
    if (/[\p{L}_]/u.test(ch)) {
      word += ch;
      stream.pos++;
    } else {
      break;
    }
  }
  stream.pos = start;
  return word.length > 0 ? word : null;
}

function eatBracketBlock(stream: StringStream): void {
  let depth = 1;
  stream.next();
  while (!stream.eol() && depth > 0) {
    const ch = stream.next();
    if (ch === "{") depth++;
    if (ch === "}") depth--;
  }
}

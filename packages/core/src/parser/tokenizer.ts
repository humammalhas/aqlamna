// ---------------------------------------------------------------------------
// Aqlamna .qalam tokenizer
// ---------------------------------------------------------------------------

// ---- Token kind constants (every kind is a named constant) ----------------

export const TokenKind = {
  TITLE_KEY: "TITLE_KEY",
  AUTHOR_KEY: "AUTHOR_KEY",
  LANGUAGE_KEY: "LANGUAGE_KEY",
  KEYWORD_VAR: "KEYWORD_VAR",
  KEYWORD_LIST: "KEYWORD_LIST",
  KEYWORD_IMAGE: "KEYWORD_IMAGE",
  KEYWORD_TRUE: "KEYWORD_TRUE",
  KEYWORD_FALSE: "KEYWORD_FALSE",
  KEYWORD_NOT: "KEYWORD_NOT",
  KEYWORD_AND: "KEYWORD_AND",
  KEYWORD_OR: "KEYWORD_OR",
  KEYWORD_ELSE: "KEYWORD_ELSE",
  KEYWORD_END: "KEYWORD_END",
  KEYWORD_DONE: "KEYWORD_DONE",
  PASSAGE_MARKER: "PASSAGE_MARKER",
  SUBSECTION_MARKER: "SUBSECTION_MARKER",
  TAG: "TAG",
  TEXT: "TEXT",
  CHOICE_STAR: "CHOICE_STAR",
  CHOICE_PLUS: "CHOICE_PLUS",
  DIVERT: "DIVERT",
  DIVERT_RETURN: "DIVERT_RETURN",
  THREAD: "THREAD",
  ASSIGN: "ASSIGN",
  BRACE_OPEN: "BRACE_OPEN",
  BRACE_CLOSE: "BRACE_CLOSE",
  BRACKET_OPEN: "BRACKET_OPEN",
  BRACKET_CLOSE: "BRACKET_CLOSE",
  PAREN_OPEN: "PAREN_OPEN",
  PAREN_CLOSE: "PAREN_CLOSE",
  COLON: "COLON",
  COMMA: "COMMA",
  OPERATOR: "OPERATOR",
  IDENTIFIER: "IDENTIFIER",
  STRING: "STRING",
  NUMBER: "NUMBER",
  EOF: "EOF",
} as const;

export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
}

// ---- Unicode helpers ------------------------------------------------------

const ARABIC_DIGIT_START = 0x0660;
function isArabicDigit(cp: number): boolean {
  return cp >= ARABIC_DIGIT_START && cp <= 0x0669;
}
function arabicDigitToWestern(cp: number): string {
  return String(cp - ARABIC_DIGIT_START);
}
function isWesternDigit(cp: number): boolean {
  return cp >= 0x30 && cp <= 0x39;
}
function isDigit(cp: number): boolean {
  return isWesternDigit(cp) || isArabicDigit(cp);
}
function isTashkeel(cp: number): boolean {
  return cp >= 0x064b && cp <= 0x0652;
}
function isTatweel(cp: number): boolean {
  return cp === 0x0640;
}
function isArabicLetter(cp: number): boolean {
  return (
    (cp >= 0x0620 && cp <= 0x064a) ||
    (cp >= 0x066e && cp <= 0x066f) ||
    (cp >= 0x0671 && cp <= 0x06d3) ||
    (cp >= 0x06d5 && cp <= 0x06d5) ||
    (cp >= 0x06fa && cp <= 0x06fc) ||
    (cp >= 0x06ff && cp <= 0x06ff)
  );
}
function isLatinLetter(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
}
function isLetter(cp: number): boolean {
  return isArabicLetter(cp) || isLatinLetter(cp);
}
function isIdentStart(cp: number): boolean {
  return isLetter(cp) || cp === 0x5f;
}
function isIdentContinue(cp: number): boolean {
  return isIdentStart(cp) || isDigit(cp) || cp === 0x2e /* . */ || isTashkeel(cp) || isTatweel(cp);
}
export function stripTashkeel(s: string): string {
  const out: string[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (!isTashkeel(cp) && !isTatweel(cp)) out.push(ch);
  }
  return out.join("");
}
function normaliseDigits(s: string): string {
  const out: string[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (isArabicDigit(cp)) out.push(arabicDigitToWestern(cp));
    else out.push(ch);
  }
  return out.join("");
}

// ---- Keyword tables -------------------------------------------------------

const FRONT_MATTER_KEYS: Record<string, TokenKind> = {
  "عنوان": TokenKind.TITLE_KEY, "TITLE": TokenKind.TITLE_KEY,
  "مؤلف": TokenKind.AUTHOR_KEY, "AUTHOR": TokenKind.AUTHOR_KEY,
  "لغة": TokenKind.LANGUAGE_KEY, "LANGUAGE": TokenKind.LANGUAGE_KEY,
};

const DECL_KEYWORDS: Record<string, TokenKind> = {
  "متغير": TokenKind.KEYWORD_VAR, "VAR": TokenKind.KEYWORD_VAR,
  "قائمة": TokenKind.KEYWORD_LIST, "LIST": TokenKind.KEYWORD_LIST,
};

const IMAGE_KEYWORDS: Record<string, TokenKind> = {
  "صورة": TokenKind.KEYWORD_IMAGE, "image": TokenKind.KEYWORD_IMAGE,
};

const BOOL_KEYWORDS: Record<string, TokenKind> = {
  "صح": TokenKind.KEYWORD_TRUE, "true": TokenKind.KEYWORD_TRUE,
  "خطأ": TokenKind.KEYWORD_FALSE, "false": TokenKind.KEYWORD_FALSE,
};

const DIVERT_END_KEYWORDS: Record<string, TokenKind> = {
  "نهاية": TokenKind.KEYWORD_END, "END": TokenKind.KEYWORD_END,
  "تابع": TokenKind.KEYWORD_DONE, "DONE": TokenKind.KEYWORD_DONE,
};

const LOGICAL_KEYWORDS: Record<string, TokenKind> = {
  "لا": TokenKind.KEYWORD_NOT, "not": TokenKind.KEYWORD_NOT,
  "و": TokenKind.KEYWORD_AND, "and": TokenKind.KEYWORD_AND,
  "أو": TokenKind.KEYWORD_OR, "or": TokenKind.KEYWORD_OR,
  "غير_ذلك": TokenKind.KEYWORD_ELSE, "else": TokenKind.KEYWORD_ELSE,
};

// ---- Scanner --------------------------------------------------------------

type Mode = "LINE_START" | "TEXT" | "CODE";

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let col = 1;
  const len = source.length;

  let mode: Mode = "LINE_START";
  let braceDepth = 0;
  const modeStack: Mode[] = [];

  function peek(offset = 0): string {
    return pos + offset < len ? source[pos + offset]! : "";
  }

  function advance(n = 1): void {
    for (let i = 0; i < n; i++) {
      if (pos >= len) return;
      const ch = source[pos]!;
      if (ch === "\n") { line++; col = 1; }
      else { col++; }
      pos++;
    }
  }

  function emit(kind: TokenKind, value: string, tokLine: number, tokCol: number): void {
    tokens.push({ kind, value, line: tokLine, column: tokCol });
  }

  function skipSpaces(): boolean {
    let skipped = false;
    while (pos < len) {
      const ch = source[pos]!;
      if (ch === " " || ch === "\t") { skipped = true; advance(); }
      else break;
    }
    return skipped;
  }

  function skipLineComment(): void {
    while (pos < len && source[pos] !== "\n") advance();
  }

  function skipBlockComment(): void {
    advance(2);
    while (pos < len) {
      if (source[pos] === "*" && peek(1) === "/") { advance(2); return; }
      advance();
    }
  }

  function scanString(): string {
    advance();
    let value = "";
    while (pos < len) {
      const ch = source[pos]!;
      if (ch === "\\" && peek(1) === '"') { value += '"'; advance(2); }
      else if (ch === "\\" && peek(1) === "\\") { value += "\\"; advance(2); }
      else if (ch === '"') { advance(); return value; }
      else if (ch === "\n") { return value; }
      else { value += ch; advance(); }
    }
    return value;
  }

  function scanNumber(): string {
    let raw = "";
    while (pos < len && isDigit(source.codePointAt(pos)!)) {
      raw += source[pos]!;
      advance();
    }
    return normaliseDigits(raw);
  }

  function scanIdentifier(): string {
    let raw = "";
    while (pos < len && isIdentContinue(source.codePointAt(pos)!)) {
      raw += source[pos]!;
      advance();
    }
    return raw;
  }

  function classifyIdentifier(raw: string, startLine: number, startCol: number): void {
    const clean = stripTashkeel(raw);
    let k: TokenKind | undefined;
    k = FRONT_MATTER_KEYS[clean]; if (k) { emit(k, clean, startLine, startCol); return; }
    k = DECL_KEYWORDS[clean]; if (k) { emit(k, clean, startLine, startCol); return; }
    k = IMAGE_KEYWORDS[clean]; if (k) { emit(k, clean, startLine, startCol); return; }
    k = BOOL_KEYWORDS[clean]; if (k) { emit(k, clean, startLine, startCol); return; }
    k = DIVERT_END_KEYWORDS[clean]; if (k) { emit(k, clean, startLine, startCol); return; }
    if (braceDepth > 0) { k = LOGICAL_KEYWORDS[clean]; if (k) { emit(k, clean, startLine, startCol); return; } }
    emit(TokenKind.IDENTIFIER, clean, startLine, startCol);
  }

  // ---- TEXT-mode scanning -------------------------------------------------

  function scanTextSegment(): string {
    let value = "";
    while (pos < len) {
      const ch = source[pos]!;
      if (ch === "\n" || ch === "\r") break;
      if (ch === "{" || ch === "}") break;
      if (ch === "-" && peek(1) === ">") break;
      value += ch;
      advance();
    }
    return value;
  }

  // ---- Determine line type on LINE_START ----------------------------------

  function peekLineMode(): Mode {
    let p = pos;
    while (p < len) {
      const c = source[p]!;
      if (c === " " || c === "\t") { p++; continue; }
      break;
    }
    if (p >= len) return "TEXT";

    const c = source[p]!;

    if (c === "/" && p + 1 < len && (source[p + 1] === "/" || source[p + 1] === "*")) {
      return "TEXT";
    }
    if (c === "=" && p + 1 < len && source[p + 1] === "=" && p + 2 < len && source[p + 2] === "=") {
      return "CODE";
    }
    if (c === "=") return "CODE";           // subsection or operator
    if (c === "*" || c === "+") return "CODE"; // choice
    if (c === "~") return "CODE";           // assignment
    if (c === "-" && p + 1 < len && source[p + 1] === ">") return "CODE";
    if (c === "<" && p + 1 < len && source[p + 1] === "-") return "CODE";

    if (isIdentStart(c.codePointAt(0)!)) {
      let wp = p;
      let word = "";
      while (wp < len && isIdentContinue(source.codePointAt(wp)!)) {
        word += source[wp]!;
        wp++;
      }
      const clean = stripTashkeel(word);
      if (FRONT_MATTER_KEYS[clean] || DECL_KEYWORDS[clean] || IMAGE_KEYWORDS[clean]) return "CODE";
    }

    return "TEXT";
  }

  // ---- CODE-mode token scanning -------------------------------------------

  function scanCodeToken(): boolean {
    skipSpaces();
    if (pos >= len) return false;

    const startLine = line;
    const startCol = col;
    const ch = source[pos]!;

    if (ch === "\n" || ch === "\r") return false;

    // Comments
    if (ch === "/" && peek(1) === "/") { skipLineComment(); return true; }
    if (ch === "/" && peek(1) === "*") { skipBlockComment(); return true; }

    // Passage marker
    if (ch === "=" && peek(1) === "=" && peek(2) === "=") {
      emit(TokenKind.PASSAGE_MARKER, "===", startLine, startCol);
      advance(3);
      return true;
    }

    // Divert arrows
    if (ch === "-" && peek(1) === ">") {
      if (peek(2) === "-" && peek(3) === ">") {
        emit(TokenKind.DIVERT_RETURN, "->->", startLine, startCol);
        advance(4);
      } else {
        emit(TokenKind.DIVERT, "->", startLine, startCol);
        advance(2);
      }
      return true;
    }

    // Thread
    if (ch === "<" && peek(1) === "-") {
      emit(TokenKind.THREAD, "<-", startLine, startCol);
      advance(2);
      return true;
    }

    // Assignment (mid-line, or after we already consumed the line-start ~)
    if (ch === "~") {
      emit(TokenKind.ASSIGN, "~", startLine, startCol);
      advance();
      return true;
    }

    // Multi-char operators
    if (
      (ch === "=" && peek(1) === "=") ||
      (ch === "!" && peek(1) === "=") ||
      (ch === "<" && peek(1) === "=") ||
      (ch === ">" && peek(1) === "=")
    ) {
      emit(TokenKind.OPERATOR, ch + peek(1), startLine, startCol);
      advance(2);
      return true;
    }
    if (ch === "\u2260" /* ≠ */) { emit(TokenKind.OPERATOR, "!=", startLine, startCol); advance(); return true; }
    if (ch === "\u2264" /* ≤ */) { emit(TokenKind.OPERATOR, "<=", startLine, startCol); advance(); return true; }
    if (ch === "\u2265" /* ≥ */) { emit(TokenKind.OPERATOR, ">=", startLine, startCol); advance(); return true; }

    // Single-char operators (including =, *, +, -, /, %, <, >)
    // Note: *, + at mid-line are operators; at line-start they were consumed
    // by the LINE_START handler.
    if (
      ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%" ||
      ch === "=" || ch === "<" || ch === ">"
    ) {
      emit(TokenKind.OPERATOR, ch, startLine, startCol);
      advance();
      return true;
    }

    // Brackets
    if (ch === "{") {
      emit(TokenKind.BRACE_OPEN, "{", startLine, startCol);
      modeStack.push(mode); // save current mode
      braceDepth++;
      advance();
      mode = "CODE";
      return true;
    }
    if (ch === "}") {
      emit(TokenKind.BRACE_CLOSE, "}", startLine, startCol);
      braceDepth = Math.max(0, braceDepth - 1);
      advance();
      if (braceDepth === 0) {
        // Restore the mode from before the matching {
        mode = modeStack.pop() ?? "TEXT";
      }
      return true;
    }
    if (ch === "[") {
      emit(TokenKind.BRACKET_OPEN, "[", startLine, startCol);
      advance();
      const labelLine = line, labelCol = col;
      let label = "";
      while (pos < len && source[pos] !== "]" && source[pos] !== "\n") {
        label += source[pos]!;
        advance();
      }
      if (label.length > 0) {
        emit(TokenKind.TEXT, label, labelLine, labelCol);
      }
      if (pos < len && source[pos] === "]") {
        emit(TokenKind.BRACKET_CLOSE, "]", line, col);
        advance();
      }
      // After ], the choice result is prose — switch to TEXT
      mode = "TEXT";
      return true;
    }
    if (ch === "]") {
      emit(TokenKind.BRACKET_CLOSE, "]", startLine, startCol);
      advance();
      mode = "TEXT";
      return true;
    }
    if (ch === "(") {
      emit(TokenKind.PAREN_OPEN, "(", startLine, startCol);
      advance();
      return true;
    }
    if (ch === ")") {
      emit(TokenKind.PAREN_CLOSE, ")", startLine, startCol);
      advance();
      return true;
    }

    // Punctuation
    if (ch === ":") {
      emit(TokenKind.COLON, ":", startLine, startCol);
      advance();
      // Inside braces, : separates condition from then-branch (prose text)
      if (braceDepth > 0) {
        modeStack.push(mode); // typically CODE
        mode = "TEXT";
      }
      return true;
    }
    if (ch === "," || ch === "\u060C") {
      emit(TokenKind.COMMA, ",", startLine, startCol);
      advance();
      return true;
    }

    // Tag
    if (ch === "#") {
      advance();
      const raw = scanIdentifier();
      emit(TokenKind.TAG, raw, startLine, startCol);
      return true;
    }

    // String
    if (ch === '"') {
      const val = scanString();
      emit(TokenKind.STRING, val, startLine, startCol);
      return true;
    }

    // Number
    if (isDigit(ch.codePointAt(0)!)) {
      const val = scanNumber();
      emit(TokenKind.NUMBER, val, startLine, startCol);
      return true;
    }

    // Identifier / keyword
    if (isIdentStart(ch.codePointAt(0)!)) {
      const raw = scanIdentifier();
      classifyIdentifier(raw, startLine, startCol);
      return true;
    }

    // Fallback: stray character in CODE — skip it
    advance();
    return true;
  }

  // ---- Main scan loop -----------------------------------------------------

  while (pos < len) {
    // Newline
    if (source[pos] === "\n" || source[pos] === "\r") {
      advance();
      if (pos < len && source[pos - 1] === "\r" && source[pos] === "\n") advance();
      mode = "LINE_START";
      continue;
    }

    // --- LINE_START ---
    if (mode === "LINE_START") {
      skipSpaces();
      if (pos >= len) break;

      // Comments at line start
      if (source[pos] === "/" && peek(1) === "/") {
        skipLineComment();
        mode = "LINE_START";
        continue;
      }
      if (source[pos] === "/" && peek(1) === "*") {
        skipBlockComment();
        mode = "LINE_START";
        continue;
      }

      // Empty line
      if (source[pos] === "\n" || source[pos] === "\r") {
        mode = "LINE_START";
        continue;
      }

      const lineMode = peekLineMode();

      if (lineMode === "CODE") {
        // Emit line-start-specific CODE tokens before entering CODE mode.
        const ch = source[pos]!;

        // Choice markers * and +
        if (ch === "*") {
          let depth = 0;
          const starLine = line, starCol = col;
          while (pos < len && source[pos] === "*") { depth++; advance(); }
          emit(TokenKind.CHOICE_STAR, "*".repeat(depth), starLine, starCol);
          mode = "CODE";
          continue;
        }
        if (ch === "+") {
          emit(TokenKind.CHOICE_PLUS, "+", line, col);
          advance();
          mode = "CODE";
          continue;
        }

        // Subsection marker (single = at line start, not ===)
        if (ch === "=" && peek(1) !== "=") {
          emit(TokenKind.SUBSECTION_MARKER, "=", line, col);
          advance();
          mode = "CODE";
          continue;
        }

        // Assignment
        if (ch === "~") {
          emit(TokenKind.ASSIGN, "~", line, col);
          advance();
          mode = "CODE";
          continue;
        }

        // For other CODE lines (===, ->, <-, declarations), let scanCodeToken handle them
        mode = "CODE";
        continue;
      }

      // Default: TEXT mode
      mode = "TEXT";
      continue;
    }

    // --- TEXT mode ---
    if (mode === "TEXT") {
      const ch = source[pos]!;

      if (ch === "\n" || ch === "\r") {
        mode = "LINE_START";
        continue;
      }

      // Brace open in text → enter code
      if (ch === "{") {
        emit(TokenKind.BRACE_OPEN, "{", line, col);
        modeStack.push("TEXT");
        braceDepth++;
        advance();
        mode = "CODE";
        continue;
      }

      // Brace close in text (stray or closing a code block)
      if (ch === "}") {
        emit(TokenKind.BRACE_CLOSE, "}", line, col);
        braceDepth = Math.max(0, braceDepth - 1);
        advance();
        if (braceDepth === 0) {
          mode = modeStack.pop() ?? "TEXT";
        }
        continue;
      }

      // Divert in text → switch to CODE
      if (ch === "-" && peek(1) === ">") {
        mode = "CODE";
        continue;
      }

      // Scan prose text segment
      const textLine = line, textCol = col;
      const segment = scanTextSegment();
      if (segment.length > 0) {
        emit(TokenKind.TEXT, segment, textLine, textCol);
      } else {
        advance();
      }
      continue;
    }

    // --- CODE mode ---
    if (mode === "CODE") {
      skipSpaces();
      if (pos >= len) break;

      // Newline within CODE
      if (source[pos] === "\n" || source[pos] === "\r") {
        advance();
        if (pos < len && source[pos - 1] === "\r" && source[pos] === "\n") advance();
        if (braceDepth > 0) {
          skipSpaces();
          // Continue in CODE for multiline conditional
        } else {
          mode = "LINE_START";
        }
        continue;
      }

      if (!scanCodeToken()) break;
      continue;
    }
  }

  // Final EOF sentinel
  emit(TokenKind.EOF, "", line, col);

  return tokens;
}

// ---- Debug helper ---------------------------------------------------------

export function dumpTokens(source: string): string {
  const tokens = tokenize(source);
  return tokens
    .map((t) => t.kind + " | " + t.value + " | " + t.line + ":" + t.column)
    .join("\n");
}

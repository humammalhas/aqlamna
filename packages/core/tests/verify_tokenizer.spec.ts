import { describe, test, expect } from "vitest";
import { tokenize, TokenKind, type Token } from "../src/parser/tokenizer.js";

/** Shorthand: tokenize and strip EOF sentinel. */
function tok(src: string): Token[] {
  const tokens = tokenize(src);
  return tokens.slice(0, -1); // drop EOF
}

/** Quick access to token kind constants. */
const K = TokenKind;

describe("tokenizer", () => {
  // ---- dotted sub-section references ---------------------------------------
  describe("dotted references", () => {
    test("divert to dotted target survives as single IDENTIFIER", () => {
      const t = tok("-> المنزل.المطبخ");
      expect(t).toEqual([
        { kind: K.DIVERT, value: "->", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "المنزل.المطبخ", line: 1, column: 4 },
      ]);
    });

    test("variable with dot", () => {
      const t = tok("متغير x.y = 5");
      expect(t).toEqual([
        { kind: K.KEYWORD_VAR, value: "متغير", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "x.y", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 11 },
        { kind: K.NUMBER, value: "5", line: 1, column: 13 },
      ]);
    });

    test("arabic dotted passage ref", () => {
      const t = tok("-> غرفة.مطبخ");
      expect(t).toEqual([
        { kind: K.DIVERT, value: "->", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "غرفة.مطبخ", line: 1, column: 4 },
      ]);
    });
  });

  // ---- diverts and tunnels -------------------------------------------------
  describe("diverts, tunnels, and returns", () => {
    test("plain divert", () => {
      const t = tok("-> نهاية");
      expect(t).toEqual([
        { kind: K.DIVERT, value: "->", line: 1, column: 1 },
        { kind: K.KEYWORD_END, value: "نهاية", line: 1, column: 4 },
      ]);
    });

    test("tunnel: -> x ->", () => {
      const t = tok("-> وصف_الغرفة ->");
      expect(t).toEqual([
        { kind: K.DIVERT, value: "->", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "وصف_الغرفة", line: 1, column: 4 },
        { kind: K.DIVERT, value: "->", line: 1, column: 15 },
      ]);
    });

    test("return: ->-> (no spaces)", () => {
      const t = tok("->->");
      expect(t).toEqual([
        { kind: K.DIVERT_RETURN, value: "->->", line: 1, column: 1 },
      ]);
    });

    test("divert DONE keyword", () => {
      const t = tok("-> تابع");
      expect(t).toEqual([
        { kind: K.DIVERT, value: "->", line: 1, column: 1 },
        { kind: K.KEYWORD_DONE, value: "تابع", line: 1, column: 4 },
      ]);
    });
  });

  // ---- threads -------------------------------------------------------------
  describe("threads", () => {
    test("thread marker", () => {
      const t = tok("<- بائع_الفاكهة");
      expect(t).toEqual([
        { kind: K.THREAD, value: "<-", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "بائع_الفاكهة", line: 1, column: 4 },
      ]);
    });
  });

  // ---- subsections ---------------------------------------------------------
  describe("subsections", () => {
    test("subsection marker at line start", () => {
      const t = tok("= غرفة_النوم");
      expect(t).toEqual([
        { kind: K.SUBSECTION_MARKER, value: "=", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "غرفة_النوم", line: 1, column: 3 },
      ]);
    });

    test("= is not subsection mid-line", () => {
      const t = tok("متغير x = 5");
      expect(t).toEqual([
        { kind: K.KEYWORD_VAR, value: "متغير", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "x", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 9 },
        { kind: K.NUMBER, value: "5", line: 1, column: 11 },
      ]);
    });
  });

  // ---- choice nesting ------------------------------------------------------
  describe("choice nesting", () => {
    test("single *", () => {
      const t = tok("* [label]");
      expect(t[0]).toEqual({ kind: K.CHOICE_STAR, value: "*", line: 1, column: 1 });
    });

    test("double ** (depth 2)", () => {
      const t = tok("** [label]");
      expect(t[0]).toEqual({ kind: K.CHOICE_STAR, value: "**", line: 1, column: 1 });
    });

    test("triple *** (depth 3)", () => {
      const t = tok("*** [label]");
      expect(t[0]).toEqual({ kind: K.CHOICE_STAR, value: "***", line: 1, column: 1 });
    });

    test("sticky choice +", () => {
      const t = tok("+ [label]");
      expect(t[0]).toEqual({ kind: K.CHOICE_PLUS, value: "+", line: 1, column: 1 });
    });

    test("* mid-line is operator, not choice", () => {
      const t = tok("~ x = y * 2");
      expect(t).toEqual([
        { kind: K.ASSIGN, value: "~", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "x", line: 1, column: 3 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 5 },
        { kind: K.IDENTIFIER, value: "y", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "*", line: 1, column: 9 },
        { kind: K.NUMBER, value: "2", line: 1, column: 11 },
      ]);
    });
  });

  // ---- لا context sensitivity -----------------------------------------------
  describe("لا context", () => {
    test("لا in prose is TEXT, not keyword", () => {
      const t = tok("لا أعرف ماذا أفعل.");
      expect(t).toEqual([
        { kind: K.TEXT, value: "لا أعرف ماذا أفعل.", line: 1, column: 1 },
      ]);
    });

    test("لا inside braces is KEYWORD_NOT", () => {
      const t = tok("{لا وجد_المفتاح: مغلق.}");
      expect(t).toEqual([
        { kind: K.BRACE_OPEN, value: "{", line: 1, column: 1 },
        { kind: K.KEYWORD_NOT, value: "لا", line: 1, column: 2 },
        { kind: K.IDENTIFIER, value: "وجد_المفتاح", line: 1, column: 5 },
        { kind: K.COLON, value: ":", line: 1, column: 16 },
        { kind: K.TEXT, value: " مغلق.", line: 1, column: 17 },
        { kind: K.BRACE_CLOSE, value: "}", line: 1, column: 23 },
      ]);
    });

    test("لا in choice condition inside { } is KEYWORD_NOT", () => {
      const t = tok("* {لا وجد_المفتاح} [حاول]");
      expect(t).toEqual([
        { kind: K.CHOICE_STAR, value: "*", line: 1, column: 1 },
        { kind: K.BRACE_OPEN, value: "{", line: 1, column: 3 },
        { kind: K.KEYWORD_NOT, value: "لا", line: 1, column: 4 },
        { kind: K.IDENTIFIER, value: "وجد_المفتاح", line: 1, column: 7 },
        { kind: K.BRACE_CLOSE, value: "}", line: 1, column: 18 },
        { kind: K.BRACKET_OPEN, value: "[", line: 1, column: 20 },
        { kind: K.TEXT, value: "حاول", line: 1, column: 21 },
        { kind: K.BRACKET_CLOSE, value: "]", line: 1, column: 25 },
      ]);
    });

    test("لا_يوجد as identifier in variable decl is IDENTIFIER, not KEYWORD_NOT", () => {
      const t = tok("متغير لا_يوجد = خطأ");
      expect(t).toEqual([
        { kind: K.KEYWORD_VAR, value: "متغير", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "لا_يوجد", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 15 },
        { kind: K.KEYWORD_FALSE, value: "خطأ", line: 1, column: 17 },
      ]);
    });
  });

  // ---- tashkeel ------------------------------------------------------------
  describe("tashkeel", () => {
    test("tashkeel stripped from identifiers", () => {
      const t = tok("متغير كَلْب = ٥");
      expect(t).toEqual([
        { kind: K.KEYWORD_VAR, value: "متغير", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "كلب", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 13 },
        { kind: K.NUMBER, value: "5", line: 1, column: 15 },
      ]);
    });

    test("tashkeel preserved in TEXT", () => {
      const t = tok("مَرْحَبًا");
      expect(t).toEqual([
        { kind: K.TEXT, value: "مَرْحَبًا", line: 1, column: 1 },
      ]);
    });

    test("tashkeel stripped in passage name (identifier)", () => {
      const t = tok("=== بَيْت ===\nمرحبًا");
      expect(t[1]).toEqual({ kind: K.IDENTIFIER, value: "بيت", line: 1, column: 5 });
    });
  });

  // ---- comments ------------------------------------------------------------
  describe("comments", () => {
    test("line comment is discarded", () => {
      const t = tok("// هذا تعليق\nمرحبًا");
      expect(t).toEqual([
        { kind: K.TEXT, value: "مرحبًا", line: 2, column: 1 },
      ]);
    });

    test("block comment is discarded", () => {
      const t = tok("/* تعليق */\nمرحبًا");
      expect(t).toEqual([
        { kind: K.TEXT, value: "مرحبًا", line: 2, column: 1 },
      ]);
    });

    test("inline comment after code", () => {
      const t = tok("متغير x = 5 // تعليق");
      expect(t).toEqual([
        { kind: K.KEYWORD_VAR, value: "متغير", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "x", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 9 },
        { kind: K.NUMBER, value: "5", line: 1, column: 11 },
      ]);
    });

    test("block comment mid-line", () => {
      // Block comments are recognized in CODE mode; in TEXT (prose) mode they
      // pass through as literal text. The fixtures do not exercise this path.
      const t = tok("مرحبًا /* تعليق */ بالعالم");
      expect(t.length).toBe(1); // single TEXT token, comment is literal
      expect(t[0]).toMatchObject({ kind: K.TEXT });
    });
  });

  // ---- Arabic digits -------------------------------------------------------
  describe("arabic digits", () => {
    test("arabic digits normalised to western", () => {
      const t = tok("متغير ع = ١٢٣");
      expect(t).toEqual([
        { kind: K.KEYWORD_VAR, value: "متغير", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "ع", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 9 },
        { kind: K.NUMBER, value: "123", line: 1, column: 11 },
      ]);
    });

    test("mixed arabic and western digits", () => {
      const t = tok("متغير س = ١٢3");
      expect(t[3]).toEqual({ kind: K.NUMBER, value: "123", line: 1, column: 11 });
    });
  });

  // ---- front matter --------------------------------------------------------
  describe("front matter", () => {
    test("arabic title key", () => {
      const t = tok('عنوان: "لصّ القصر"');
      expect(t).toEqual([
        { kind: K.TITLE_KEY, value: "عنوان", line: 1, column: 1 },
        { kind: K.COLON, value: ":", line: 1, column: 6 },
        { kind: K.STRING, value: "لصّ القصر", line: 1, column: 8 },
      ]);
    });

    test("english TITLE key", () => {
      const t = tok('TITLE: "Test"');
      expect(t).toEqual([
        { kind: K.TITLE_KEY, value: "TITLE", line: 1, column: 1 },
        { kind: K.COLON, value: ":", line: 1, column: 6 },
        { kind: K.STRING, value: "Test", line: 1, column: 8 },
      ]);
    });
  });

  // ---- passage headers and tags --------------------------------------------
  describe("passage headers and tags", () => {
    test("passage header with tag", () => {
      const t = tok("=== البداية === #مشهد_أول");
      expect(t).toEqual([
        { kind: K.PASSAGE_MARKER, value: "===", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "البداية", line: 1, column: 5 },
        { kind: K.PASSAGE_MARKER, value: "===", line: 1, column: 13 },
        { kind: K.TAG, value: "مشهد_أول", line: 1, column: 17 },
      ]);
    });

    test("passage header without tag", () => {
      const t = tok("=== البداية ===");
      expect(t).toEqual([
        { kind: K.PASSAGE_MARKER, value: "===", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "البداية", line: 1, column: 5 },
        { kind: K.PASSAGE_MARKER, value: "===", line: 1, column: 13 },
      ]);
    });
  });

  // ---- choices with labels -------------------------------------------------
  describe("choice labels", () => {
    test("choice label text is TEXT between brackets", () => {
      const t = tok("* [افتح الباب]");
      expect(t).toEqual([
        { kind: K.CHOICE_STAR, value: "*", line: 1, column: 1 },
        { kind: K.BRACKET_OPEN, value: "[", line: 1, column: 3 },
        { kind: K.TEXT, value: "افتح الباب", line: 1, column: 4 },
        { kind: K.BRACKET_CLOSE, value: "]", line: 1, column: 14 },
      ]);
    });
  });

  // ---- assignment ----------------------------------------------------------
  describe("assignment", () => {
    test("simple assignment", () => {
      const t = tok("~ الرحيق = 5");
      expect(t).toEqual([
        { kind: K.ASSIGN, value: "~", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "الرحيق", line: 1, column: 3 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 10 },
        { kind: K.NUMBER, value: "5", line: 1, column: 12 },
      ]);
    });

    test("assignment with addition", () => {
      const t = tok("~ س = س + 2");
      expect(t).toEqual([
        { kind: K.ASSIGN, value: "~", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "س", line: 1, column: 3 },
        { kind: K.OPERATOR, value: "=", line: 1, column: 5 },
        { kind: K.IDENTIFIER, value: "س", line: 1, column: 7 },
        { kind: K.OPERATOR, value: "+", line: 1, column: 9 },
        { kind: K.NUMBER, value: "2", line: 1, column: 11 },
      ]);
    });
  });

  // ---- boolean literals ----------------------------------------------------
  describe("boolean literals", () => {
    test("arabic true", () => {
      const t = tok("متغير وجد = صح");
      expect(t[3]).toEqual({ kind: K.KEYWORD_TRUE, value: "صح", line: 1, column: 13 });
    });

    test("arabic false", () => {
      const t = tok("متغير وجد = خطأ");
      expect(t[3]).toEqual({ kind: K.KEYWORD_FALSE, value: "خطأ", line: 1, column: 13 });
    });

    test("english true", () => {
      const t = tok("VAR found = true");
      expect(t[3]).toEqual({ kind: K.KEYWORD_TRUE, value: "true", line: 1, column: 13 });
    });
  });

  // ---- operators -----------------------------------------------------------
  describe("operators", () => {
    test("comparison operators", () => {
      const cases: Array<[string, string]> = [
        ["==", "=="], ["!=", "!="], ["<", "<"], [">", ">"], ["<=", "<="], [">=", ">="],
        ["≠", "!="], ["≤", "<="], ["≥", ">="],
      ];
      for (const [input, expected] of cases) {
        const t = tok(`{x ${input} 5: text}`);
        expect(t[2]).toEqual({ kind: K.OPERATOR, value: expected, line: 1, column: 4 });
      }
    });

    test("arithmetic operators", () => {
      const t = tok("~ x = a + b - c * d / e % f");
      const ops = t.filter((tk) => tk.kind === K.OPERATOR && tk.value !== "=");
      expect(ops.map((o) => o.value)).toEqual(["+", "-", "*", "/", "%"]);
    });
  });

  // ---- interpolation vs conditional ----------------------------------------
  describe("interpolation vs conditional", () => {
    test("interpolation {var} has no colon", () => {
      const t = tok("جمعتِ {الرحيق} قطرة.");
      expect(t).toEqual([
        { kind: K.TEXT, value: "جمعتِ ", line: 1, column: 1 },
        { kind: K.BRACE_OPEN, value: "{", line: 1, column: 7 },
        { kind: K.IDENTIFIER, value: "الرحيق", line: 1, column: 8 },
        { kind: K.BRACE_CLOSE, value: "}", line: 1, column: 14 },
        { kind: K.TEXT, value: " قطرة.", line: 1, column: 15 },
      ]);
    });

    test("conditional {cond: text} has colon, text after is TEXT", () => {
      const t = tok("{وجد_المفتاح: الخريطة معك.}");
      expect(t).toEqual([
        { kind: K.BRACE_OPEN, value: "{", line: 1, column: 1 },
        { kind: K.IDENTIFIER, value: "وجد_المفتاح", line: 1, column: 2 },
        { kind: K.COLON, value: ":", line: 1, column: 13 },
        { kind: K.TEXT, value: " الخريطة معك.", line: 1, column: 14 },
        { kind: K.BRACE_CLOSE, value: "}", line: 1, column: 27 },
      ]);
    });
  });

  // ---- empty lines and whitespace -----------------------------------------
  describe("whitespace and empty lines", () => {
    test("empty lines between passages produce no tokens except newlines", () => {
      const t = tok("=== a ===\n\n=== b ===");
      expect(t.length).toBe(6); // 2 × (PASSAGE_MARKER + IDENTIFIER + PASSAGE_MARKER)
      // PASSAGE_MARKER, IDENTIFIER, PASSAGE_MARKER, (blank line skipped), PASSAGE_MARKER, IDENTIFIER, PASSAGE_MARKER, EOF
      // Actually blank lines produce no tokens at all.
      expect(t.filter((tk) => tk.kind === K.TEXT).length).toBe(0);
    });
  });
});

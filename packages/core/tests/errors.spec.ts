import { describe, test, expect } from "vitest";
import { compile } from "../src/index.js";
import type { QalamError } from "../src/parser/errors.js";

/** Helper: compile and assert it throws a specific QalamError code. */
function assertError(
  src: string,
  expectedCode: string,
  extraAsserts?: (err: QalamError) => void,
): void {
  try {
    compile(src, "test.qalam");
    expect.fail(`Expected QalamError ${expectedCode} but nothing was thrown`);
  } catch (e) {
    const err = e as QalamError;
    expect(err.code).toBe(expectedCode);
    expect(err.message_ar).toBeTruthy();
    expect(err.message_en).toBeTruthy();
    expect(typeof err.line).toBe("number");
    expect(typeof err.column).toBe("number");
    if (extraAsserts) extraAsserts(err);
  }
}

describe("error codes (§1.9)", () => {
  test("E101 — divert target does not exist", () => {
    assertError("=== بداية ===\n-> غير_موجود", "E101", (err) => {
      expect(err.message_ar).toContain("غير_موجود");
      expect(err.message_en).toContain("غير_موجود");
      expect(err.line).toBeGreaterThan(0);
      expect(err.column).toBeGreaterThan(0);
    });
  });

  test("E102 — duplicate passage name", () => {
    assertError("=== بداية ===\nنص.\n=== بداية ===\nنص.", "E102", (err) => {
      expect(err.message_ar).toContain("بداية");
      expect(err.message_en).toContain("بداية");
    });
  });

  test("E103 — unterminated passage header", () => {
    assertError("=== بداية", "E103", (err) => {
      expect(err.message_ar).toContain("===");
    });
  });

  test("E104 — choice outside a passage", () => {
    assertError("* [اختر] قبل أي مقطع.", "E104");
  });

  test("E105 — malformed conditional (unclosed brace)", () => {
    assertError("=== بداية ===\n{وجد: لم يغلق", "E105");
  });

  test("E201 — unsupported expression in assignment", () => {
    assertError(
      "متغير س = 0\n=== بداية ===\n~ س = ص + ع",
      "E201",
      (err) => {
        expect(err.message_ar).toContain("ص + ع");
        expect(err.message_en).toContain("ص + ع");
      },
    );
  });

  test("E202 — undeclared variable (interpolation)", () => {
    assertError("=== بداية ===\n{غير_معرف}", "E202", (err) => {
      expect(err.message_ar).toContain("غير_معرف");
      expect(err.message_en).toContain("غير_معرف");
      expect(err.line).toBeGreaterThan(0);
      expect(err.column).toBeGreaterThan(0);
    });
  });

  test("E203 — type mismatch in assignment", () => {
    assertError(
      "متغير س = 0\n=== بداية ===\n~ س = \"نص\"",
      "E203",
      (err) => {
        expect(err.message_ar).toContain("س");
        expect(err.message_ar).toContain("رقم");
        expect(err.message_en).toContain("س");
        expect(err.line).toBeGreaterThan(0);
        expect(err.column).toBeGreaterThan(0);
        // English message must NOT contain Arabic type names
        expect(err.message_en).not.toMatch(/رقم|نصّ|صح\/خطأ|قائمة/);
      },
    );
  });

  test("E202 — undeclared variable (condition)", () => {
    assertError("=== بداية ===\n{غير_موجود: نص.}", "E202", (err) => {
      expect(err.message_ar).toContain("غير_موجود");
    });
  });
});

// ---- Tashkeel normalisation (§1.12 / §7.2) ----------------------------------

describe("tashkeel normalisation", () => {
  test("multi-branch with tashkeel in header and branch conditions compiles", () => {
    const src = `متغير المكوّنات = 0

=== أ ===
{المكوّنات:
  - المكوّنات < 3: قليل.
  - غير_ذلك: كثير.
}
-> نهاية`;
    const result = compile(src, "test.qalam");
    expect(result.passages).toBeDefined();
    const passages = result.passages as Record<string, unknown>;
    expect(Object.keys(passages).length).toBeGreaterThanOrEqual(1);
  });

  test("multi-branch with tashkeel in branch conditions (plain header)", () => {
    const src = `متغير المكوّنات = 0

=== أ ===
{المكونات:
  - المكوّنات < 3: قليل.
  - غير_ذلك: كثير.
}
-> نهاية`;
    const result = compile(src, "test.qalam");
    expect(result.passages).toBeDefined();
  });

  test("variable declared with tashkeel, referenced without in interpolation", () => {
    const src = `متغير المكوّنات = 0

=== أ ===
عندك {المكونات} مكونات.
-> نهاية`;
    const result = compile(src, "test.qalam");
    expect(result.passages).toBeDefined();
  });

  test("variable declared without tashkeel, referenced with in interpolation", () => {
    const src = `متغير المكونات = 0

=== أ ===
عندك {المكوّنات} مكونات.
-> نهاية`;
    const result = compile(src, "test.qalam");
    expect(result.passages).toBeDefined();
  });

  test("variable declared with tashkeel, referenced without in single conditional", () => {
    const src = `متغير وجدَ = صح

=== أ ===
{وجد: موجود.}
-> نهاية`;
    const result = compile(src, "test.qalam");
    expect(result.passages).toBeDefined();
  });

  test("variable declared with tashkeel, referenced without in assignment", () => {
    const src = `متغير العَدَد = 0

=== أ ===
~ العدد = 5
-> نهاية`;
    const result = compile(src, "test.qalam");
    expect(result.passages).toBeDefined();
  });

  test("variable declared with tashkeel, referenced without in choice condition", () => {
    const src = `متغير فَتحَ = صح

=== أ ===
+ {فتح} [الباب مفتوح]
  -> نهاية`;
    const result = compile(src, "test.qalam");
    expect(result.passages).toBeDefined();
  });

  test("undeclared variable with tashkeel still raises E202", () => {
    assertError(
      "=== بداية ===\n{المكوّنات: نص.}",
      "E202",
      (err) => {
        expect(err.message_ar).toContain("المكونات");
      },
    );
  });
});

// ---- Image errors (IMAGES_SPEC section 1.3) ----------------------------------

describe("image errors (E106/E107/E108)", () => {
  test("E106 -- image reference to undeclared name", () => {
    assertError(
      "=== بداية ===\nصورة: غير_موجود\n-> نهاية",
      "E106",
      (err) => {
        expect(err.message_ar).toContain("غير_موجود");
        expect(err.message_en).toContain("غير_موجود");
      },
    );
  });

  test("E106 -- image reference to undeclared name (English alias)", () => {
    assertError(
      "=== بداية ===\nimage: nowhere\n-> نهاية",
      "E106",
      (err) => {
        expect(err.message_en).toContain("nowhere");
      },
    );
  });

  test("E107 -- duplicate image name", () => {
    assertError(
      'صورة بوابة = "وصف"\nصورة بوابة = "وصف آخر"',
      "E107",
      (err) => {
        expect(err.message_ar).toContain("بوابة");
        expect(err.message_en).toContain("بوابة");
      },
    );
  });

  test("E107 -- duplicate image name (English alias)", () => {
    assertError(
      'image gate = "desc"\nimage gate = "other"',
      "E107",
      (err) => {
        expect(err.message_en).toContain("gate");
      },
    );
  });

  test("E108 -- image declaration missing the description string", () => {
    assertError(
      "صورة بوابة =",
      "E108",
    );
  });

  test("E108 -- image declaration with no equals or string", () => {
    assertError(
      "صورة بوابة",
      "E108",
    );
  });
});

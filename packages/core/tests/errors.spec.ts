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
      },
    );
  });

  test("E202 — undeclared variable (condition)", () => {
    assertError("=== بداية ===\n{غير_موجود: نص.}", "E202", (err) => {
      expect(err.message_ar).toContain("غير_موجود");
    });
  });
});

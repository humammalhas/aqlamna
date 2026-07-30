// ---------------------------------------------------------------------------
// Editor smoke tests — compile-then-mount, error messages, player mounting.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { compile } from "@aqlamna/core";
import { mount } from "@aqlamna/runtime";
import type { StoryJSON } from "@aqlamna/runtime";

describe("editor compilation", () => {
  it("compiles demo story without error", () => {
    const src = `عنوان: "العطر المفقود"

متغير المكوّنات = 0

=== الدكّان ===

"وصفة جدّتي ضاعت،" قال.

* [اسأليه عن الثلاثة]
  -> الجرار

=== الجرار ===

فتح ثلاث جرارٍ.

* [اجمع المكوّنات]
  ~ المكوّنات = المكوّنات + 1
  -> الدكّان

+ {المكوّنات >= 3} [اخلطي العطر]
  -> الخلط

=== الخلط ===
قطرتان من ماء الورد.
`;

    const result = compile(src, "test.qalam");

    expect(result).toBeDefined();
    expect(result.qalam_version).toBe("0.1");
    expect(result.passages).toBeDefined();

    // The story has multiple passages
    const passages = result.passages as Record<string, unknown>;
    expect(Object.keys(passages).length).toBeGreaterThanOrEqual(3);
  });

  it("surfaces Arabic error message for broken source", () => {
    // Missing === closing tag on passage header
    const src = `=== البداية
نص بدون إغلاق
`;

    let caught: Record<string, unknown> | null = null;

    try {
      compile(src, "test.qalam");
    } catch (err: unknown) {
      caught = err as Record<string, unknown>;
    }

    expect(caught).not.toBeNull();
    expect(caught!.code).toBeDefined();
    expect(caught!.message_ar).toBeDefined();
    expect(typeof caught!.message_ar).toBe("string");
    expect((caught!.message_ar as string).length).toBeGreaterThan(0);
    // Should be Arabic, not a raw JS stack
    expect(caught!.message_ar).not.toContain("Error");
    expect(caught!.message_ar).not.toContain("at ");
    // Should have a real line number
    expect(caught!.line).toBeGreaterThan(0);
  });

  it("surfaces Arabic error for undefined passage divert", () => {
    const src = `متغير س = 0

=== البداية ===
-> مقطع_غير_موجود
`;

    let caught: Record<string, unknown> | null = null;

    try {
      compile(src, "test.qalam");
    } catch (err: unknown) {
      caught = err as Record<string, unknown>;
    }

    expect(caught).not.toBeNull();
    expect(caught!.code).toBe("E101");
    expect(caught!.message_ar).toContain("مقطع");
    expect(caught!.line).toBeGreaterThan(0);
  });
});

describe("player mounting", () => {
  it("renders choices as styled buttons after mounting a story", () => {
    const src = `عنوان: "اختبار"

متغير س = 0

=== البداية ===
* [اختر هذا]
  -> نهاية
`;

    const storyJson = compile(src, "test.qalam") as unknown as StoryJSON;
    const container = document.createElement("div");

    mount(storyJson, container, { showToolbar: false });

    const buttons = container.querySelectorAll("button.aq-choice-btn");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0]!.textContent).toContain("اختر هذا");

    const choicesWrapper = container.querySelector(".aq-choices");
    expect(choicesWrapper).not.toBeNull();
    expect(choicesWrapper!.querySelectorAll("button.aq-choice-btn").length).toBe(
      buttons.length,
    );
  });
});

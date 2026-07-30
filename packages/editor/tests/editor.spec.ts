// ---------------------------------------------------------------------------
// Editor smoke tests — compile-then-mount works for fixture 03, and a broken
// source surfaces an Arabic error message rather than throwing.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { compile } from "@aqlamna/core";
import { mount } from "@aqlamna/runtime";
import type { StoryJSON } from "@aqlamna/runtime";

describe("editor compilation", () => {
  it("compiles fixture 03 (variables story) without error", () => {
    const src = `عنوان: "الرحيق"

متغير الرحيق = 0
متغير وجد_الخريطة = خطأ
متغير اسم_البطل = "نحلة"

=== البداية ===

{وجد_الخريطة: الخريطة معك.}
جمعتِ {الرحيق} قطرة.

+ [اجمع الرحيق]
  ~ الرحيق = الرحيق + 2
  -> البداية

* [تحدثي مع النحلة الحكيمة]
  ~ وجد_الخريطة = صح
  -> البداية

+ {الرحيق >= 4} [عودي إلى الخلية]
  -> نهاية
`;

    const result = compile(src, "test.qalam");

    expect(result).toBeDefined();
    expect(result.qalam_version).toBe("0.1");
    expect(result.passages).toBeDefined();

    // The story has 2 passages (البداية and its auto-generated نهاية)
    const passages = result.passages as Record<string, unknown>;
    expect(Object.keys(passages).length).toBeGreaterThanOrEqual(1);
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
  it("renders choices as styled buttons after mounting fixture 03", () => {
    const src = `عنوان: "اختبار"

متغير س = 0

=== البداية ===
* [اختر هذا]
  -> نهاية
`;

    const storyJson = compile(src, "test.qalam") as unknown as StoryJSON;
    const container = document.createElement("div");

    // Mount the player (no styles injected by the test — the component handles that;
    // here we test that the runtime renders the correct DOM structure)
    mount(storyJson, container, { showToolbar: false });

    // Verify choice buttons exist
    const buttons = container.querySelectorAll("button.aq-choice-btn");
    expect(buttons.length).toBeGreaterThanOrEqual(1);

    // Verify the first button has the expected text
    expect(buttons[0]!.textContent).toContain("اختر هذا");

    // Verify buttons are inside the choices wrapper
    const choicesWrapper = container.querySelector(".aq-choices");
    expect(choicesWrapper).not.toBeNull();
    expect(choicesWrapper!.querySelectorAll("button.aq-choice-btn").length).toBe(
      buttons.length,
    );
  });
});

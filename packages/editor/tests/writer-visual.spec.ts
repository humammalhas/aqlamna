// ---------------------------------------------------------------------------
// The visual writer, in a real browser.
//
// `writer.spec.ts` proves the generator and the round trip. It cannot prove
// that a person can reach any of it: whether the pane opens by default, whether
// a scene name typed into a box arrives in the played story, whether the phone
// layout overflows, or whether a `->` is visible anywhere on a surface that
// promises no syntax. Reading the code cannot answer those either — this
// project has twice shipped a "visual fix" nobody had rendered.
//
// Run: npm run test:visual -w @aqlamna/editor   (inside `npm test`)
// ---------------------------------------------------------------------------

import { test, expect, type Page } from "@playwright/test";

/** A returning writer's profile: onboarding seen, defaults otherwise. */
async function prepareProfile(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aqlamna-onboarding-done", "1");
      localStorage.removeItem("aqlamna-writer-mode");
    } catch { /* private mode */ }
  });
}

/** Wait for the writer pane and its first scene card. */
async function openWriter(page: Page) {
  await page.goto("/");
  await page.waitForSelector('[data-writer="visual"]', { timeout: 15000 });
  await page.waitForSelector("[data-writer-scene]", { timeout: 15000 });
}

/**
 * Build a two-scene story with one choice, using nothing but the pane's own
 * fields — the same clicks a person makes.
 */
async function writeTinyStory(page: Page) {
  await page.getByLabel("عنوان القصة").fill("باب خشبي");

  const first = page.locator("[data-writer-scene]").first();
  await first.getByLabel("اسم المقطع 1").fill("البداية");
  await first.getByLabel("نصّ المقطع 1").fill("أنت واقف أمام باب خشبي قديم.");

  await first.getByRole("button", { name: "＋ أضف خيارًا" }).click();
  await first.getByLabel("نصّ الخيار 1").fill("اطرق الباب");

  // "مقطع جديد" makes the destination scene and selects it in one go.
  await first.getByLabel("وجهة الخيار 1").selectOption({ label: "＋ مقطع جديد" });

  const second = page.locator("[data-writer-scene]").nth(1);
  await second.getByLabel("اسم المقطع 2").fill("الداخل");
  await second.getByLabel("نصّ المقطع 2").fill("غرفة مظلمة. رائحة بخور قديم.");
  await second.getByLabel("تنتهي القصة هنا").check();
}

// ---- 1. What a new visitor gets --------------------------------------------

test.describe("the قصتك tab opens on the visual writer", () => {
  test("no CodeMirror, one scene card, and a place to type", async ({ page }) => {
    await prepareProfile(page);
    await openWriter(page);

    expect(await page.locator('[data-writer="visual"]').count()).toBe(1);
    expect(await page.locator(".cm-content").count()).toBe(0);
    expect(await page.locator("[data-writer-scene]").count()).toBe(1);
    await expect(page.getByLabel("نصّ المقطع 1")).toBeVisible();
  });

  test("nothing on the authoring surface reads as syntax", async ({ page }) => {
    await prepareProfile(page);
    await openWriter(page);
    await writeTinyStory(page);

    const visible = await page.locator('[data-writer="visual"]').innerText();
    for (const token of ["===", "->", "متغير ", "* [", "+ ["]) {
      expect(visible, `"${token}" is on screen: ${visible.slice(0, 400)}`).not.toContain(token);
    }
    // The braces of a condition are the ones authors could not discover at all.
    expect(visible).not.toMatch(/\{[^}]*:/);
  });
});

// ---- 2. It plays -----------------------------------------------------------

test.describe("a story written in the form plays and maps", () => {
  test("▶ شغّل renders the prose and the choice the author typed", async ({ page }) => {
    await prepareProfile(page);
    await openWriter(page);
    await writeTinyStory(page);

    await page.getByRole("button", { name: "شغّل القصة" }).click();
    await page.waitForSelector(".player-pane .aq-choice-btn", { timeout: 15000 });

    const text = await page.locator(".player-pane").innerText();
    expect(text).toContain("أنت واقف أمام باب خشبي قديم.");

    const labels = await page.$$eval(".player-pane .aq-choice-btn", (bs) =>
      bs.map((b) => (b.textContent ?? "").trim()),
    );
    expect(labels).toContain("اطرق الباب");
  });

  test("the choice leads to the second scene", async ({ page }) => {
    await prepareProfile(page);
    await openWriter(page);
    await writeTinyStory(page);

    await page.getByRole("button", { name: "شغّل القصة" }).click();
    await page.waitForSelector(".player-pane .aq-choice-btn", { timeout: 15000 });
    await page.locator(".player-pane .aq-choice-btn", { hasText: "اطرق الباب" }).click();

    await expect(page.locator(".player-pane")).toContainText("غرفة مظلمة.", { timeout: 10000 });
  });

  test("⬇ تصدير yields a standalone file carrying the author's words", async ({ page }) => {
    await prepareProfile(page);
    await openWriter(page);
    await writeTinyStory(page);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.getByRole("button", { name: "تصدير القصة" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.html$/);

    // Read structurally: this package pins `types: ["vite/client"]` and has no
    // @types/node, so `Buffer` here would fail `npm run typecheck`.
    const stream = await download.createReadStream();
    const html = await new Promise<string>((resolve, reject) => {
      let out = "";
      stream.on("data", (c: { toString(): string }) => { out += c.toString(); });
      stream.on("end", () => resolve(out));
      stream.on("error", reject);
    });

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("class Engine");
    expect(html).toContain("أنت واقف أمام باب خشبي قديم.");
    expect(html).toContain("اطرق الباب");
    expect(html).toContain("غرفة مظلمة. رائحة بخور قديم.");
  });

  test("مخطط draws both scenes", async ({ page }) => {
    await prepareProfile(page);
    await openWriter(page);
    await writeTinyStory(page);

    await page.getByRole("button", { name: "مخطط", exact: true }).first().click();
    await page.waitForSelector(".react-flow__node", { timeout: 15000 });
    expect(await page.locator(".react-flow__node").count()).toBe(2);
  });
});

// ---- 3. It survives a reload ----------------------------------------------

test("the story comes back into the cards after a reload", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);
  await writeTinyStory(page);

  await page.reload();
  await page.waitForSelector("[data-writer-scene]", { timeout: 15000 });

  expect(await page.locator("[data-writer-scene]").count()).toBe(2);
  await expect(page.getByLabel("عنوان القصة")).toHaveValue("باب خشبي");
  await expect(page.getByLabel("اسم المقطع 1")).toHaveValue("البداية");
  await expect(page.getByLabel("نصّ المقطع 1")).toHaveValue("أنت واقف أمام باب خشبي قديم.");
  await expect(page.getByLabel("نصّ الخيار 1")).toHaveValue("اطرق الباب");
});

// ---- 4. The advanced mode --------------------------------------------------

test("switching to متقدّم shows the very source the form generated", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);
  await writeTinyStory(page);

  await page.getByRole("button", { name: "الإعدادات" }).click();
  await page.locator("[data-writer-mode-toggle]").click();
  await page.keyboard.press("Escape");

  await page.waitForSelector(".cm-line", { timeout: 15000 });
  const source = await page.$$eval(".cm-line", (ls) => ls.map((l) => l.textContent).join("\n"));

  expect(source).toContain("=== البداية ===");
  expect(source).toContain("=== الداخل ===");
  expect(source).toContain("[اطرق الباب]");
  expect(source).toContain("أنت واقف أمام باب خشبي قديم.");
  expect(await page.locator('[data-writer="visual"]').count()).toBe(0);
});

// ---- 5. A story the form cannot draw --------------------------------------

test("العطر المفقود says why it cannot be shown instead of losing it", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "افتح مثالًا" }).first().click();

  const escape = page.getByRole("button", { name: "افتح المحرّر النصّي" });
  await expect(escape).toBeVisible({ timeout: 15000 });

  // And the story itself is untouched. CodeMirror only renders the lines in
  // view, so counting `.cm-line` proves nothing about the tail of the file —
  // the map is built from the whole source and all eleven passages are there.
  await escape.click();
  await page.waitForSelector(".cm-line", { timeout: 15000 });
  const source = await page.$$eval(".cm-line", (ls) => ls.map((l) => l.textContent).join("\n"));
  expect(source).toContain("=== الدكّان ===");
  expect(source).toContain("غير_ذلك");

  await page.getByRole("button", { name: "مخطط", exact: true }).first().click();
  await page.waitForSelector(".react-flow__node", { timeout: 15000 });
  expect(await page.locator(".react-flow__node").count()).toBe(11);
});

// ---- 6. The phone ----------------------------------------------------------

test("no horizontal overflow at 390px, and every control is thumb-sized", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareProfile(page);
  await openWriter(page);
  await writeTinyStory(page);

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    pane: (() => {
      const el = document.querySelector<HTMLElement>('[data-writer="visual"]')!;
      return el.scrollWidth - el.clientWidth;
    })(),
  }));
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(0);
  expect(overflow.pane, JSON.stringify(overflow)).toBeLessThanOrEqual(0);

  const small = await page.$$eval(
    '[data-writer="visual"] button',
    (bs) =>
      bs
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => ({ text: (b.textContent ?? "").trim(), h: b.getBoundingClientRect().height }))
        .filter((b) => b.h < 36),
  );
  expect(small, JSON.stringify(small)).toHaveLength(0);
});

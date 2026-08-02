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

// ---- 5. افتح مثالًا opens IN the visual writer ------------------------------
//
// This test used to assert the opposite: that the example was too advanced for
// the pane and showed a fallback banner. It shipped that way for a day. The
// example is the first thing a curious visitor clicks, and it threw them out of
// the editor into a message about multi-branch conditionals.

test("افتح مثالًا loads a story into the cards, and it plays", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "افتح مثالًا" }).first().click();
  await page.waitForTimeout(600);

  // Cards, not a banner.
  expect(await page.locator("[data-writer-blocked]").count()).toBe(0);
  expect(await page.locator("[data-writer-scene]").count()).toBeGreaterThan(1);

  // And it is a real story, not a stub.
  await page.getByRole("button", { name: "شغّل القصة" }).click();
  await page.waitForSelector(".player-pane .aq-choice-btn", { timeout: 15000 });
  expect(await page.locator(".player-pane .aq-choice-btn").count()).toBeGreaterThan(1);
});

test("قصة جديدة is the way back, from either mode", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);
  page.on("dialog", (d) => d.accept());

  // Get deliberately stuck: switch to the advanced mode.
  await page.getByRole("button", { name: "الإعدادات" }).click();
  await page.locator("[data-writer-mode-toggle]").click();
  await page.keyboard.press("Escape");
  await page.waitForSelector(".cm-line", { timeout: 15000 });

  // قصة جديدة used to clear the document and leave you in CodeMirror, with
  // ⚙️ → وضع المحرر the only route back. Nobody finds that.
  await page.getByRole("button", { name: "قصة جديدة" }).first().click();
  await page.waitForSelector("[data-writer-scene]", { timeout: 15000 });
  expect(await page.locator(".cm-content").count()).toBe(0);
  expect(await page.locator("[data-writer-scene]").count()).toBe(1);
});

test("the example ships its illustration — card, player and export", async ({ page }) => {
  // The bytes are seeded into IndexedDB from the bundle, because a first-time
  // visitor has an empty database and a placeholder frame would hide the one
  // feature the example exists to demonstrate.
  await prepareProfile(page);
  await openWriter(page);
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "افتح مثالًا" }).first().click();
  await page.waitForSelector("[data-writer-scene] img", { timeout: 20000 });

  // 1. On the scene card.
  const card = page.locator("[data-writer-scene] img").first();
  await expect(card).toBeVisible();
  expect(await card.getAttribute("src")).toContain("data:image/webp;base64,");

  // 2. In the run. The compiled JSON carries declarations only; PlayerPane
  //    inlines the bytes the way the exporter does.
  await page.getByRole("button", { name: "شغّل القصة" }).click();
  await page.waitForSelector(".player-pane .aq-choice-btn", { timeout: 20000 });
  await expect(page.locator(".player-pane img").first()).toBeVisible();

  // 3. In the standalone file.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "تصدير القصة" }).click(),
  ]);
  const stream = await download.createReadStream();
  const html = await new Promise<string>((resolve, reject) => {
    let out = "";
    stream.on("data", (c: { toString(): string }) => { out += c.toString(); });
    stream.on("end", () => resolve(out));
    stream.on("error", reject);
  });
  expect(html).toContain("data:image/webp;base64,");
  // Without the picture the same story exports at ~52KB; with it, ~114KB.
  expect(html.length, `exported ${html.length} bytes`).toBeGreaterThan(90000);
});

test("the صورة row offers a suggestion button, disabled until there is prose", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);

  // A brand-new scene has no prose, so there is nothing to suggest FROM. The
  // button says why in its tooltip rather than failing after a round trip.
  const first = page.locator("[data-writer-scene]").first();
  await first.getByLabel("صورة المقطع 1").selectOption({ index: 0 });

  page.on("dialog", (d) => d.accept("غلاف"));
  await first.getByLabel("صورة المقطع 1").selectOption({ label: "＋ صورة جديدة" });

  const suggest = first.getByRole("button", { name: /اقترح من النصّ/ });
  await expect(suggest).toBeVisible();
  await expect(suggest).toBeDisabled();
  await expect(suggest).toHaveAttribute("title", "اكتب نصّ المقطع أولًا");

  // Give the scene prose and the button becomes available. It still needs a
  // text-provider key to actually call anything, which this profile has not
  // got — so it stays disabled, and that is the honest state to assert.
  await first.getByLabel("نصّ المقطع 1").fill("رفوف الخشب تصطفّ حتى السقف.");
  await expect(suggest).toHaveAttribute("title", "اقرأ نصّ المقطع واقترح وصفًا");
});

// ---- 6. A story the form genuinely cannot draw -----------------------------

test("a hand-written tunnel is refused with a reason, and TWO ways out", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);

  // A tunnel (`->->`) has no field in the pane and never will have one here.
  await page.getByRole("button", { name: "الإعدادات" }).click();
  await page.locator("[data-writer-mode-toggle]").click();
  await page.keyboard.press("Escape");
  await page.waitForSelector(".cm-line", { timeout: 15000 });
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\n=== نفق ===\n\nنصّ.\n->->\n", { delay: 8 });
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: "عد إلى المرئي" }).click();
  await expect(page.locator("[data-writer-blocked]")).toBeVisible({ timeout: 15000 });

  // Both doors. The one-way version of this banner is what locked authors in.
  await expect(page.getByRole("button", { name: "ابدأ قصة جديدة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "افتح المحرّر النصّي" })).toBeVisible();

  // And nothing was lost: the source still has the tunnel in it.
  await page.getByRole("button", { name: "افتح المحرّر النصّي" }).click();
  await page.waitForSelector(".cm-line", { timeout: 15000 });
  const source = await page.$$eval(".cm-line", (ls) => ls.map((l) => l.textContent).join("\n"));
  expect(source).toContain("=== نفق ===");
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

// ---- 8. Three things reported from the live editor, 2 Aug 2026 -------------

/** A 1×1 WebP, so a test never needs an API key to have "a drawn picture". */
const PIXEL_WEBP =
  "data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAABwAQCdASoBAAEADMDOJaACdAFAAAD+0uw2xVtQtAAAAA==";

/** Put bytes straight into the editor's image store, under any key. */
async function seedImageBytes(page: Page, imageName: string, dataUrl: string) {
  await page.evaluate(
    async ([name, url]) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("aqlamna-editor", 3);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("images", "readwrite");
          tx.objectStore("images").put(
            { dataUrl: url, width: 1, height: 1, bytes: 40, generatedAt: 1 },
            `default:${name}`,
          );
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    [imageName, dataUrl] as const,
  );
}

/** Read the keys the image store holds right now. */
async function imageKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    return new Promise<string[]>((resolve) => {
      const open = indexedDB.open("aqlamna-editor", 3);
      open.onerror = () => resolve([]);
      open.onsuccess = () => {
        const db = open.result;
        const req = db.transaction("images", "readonly").objectStore("images").getAllKeys();
        req.onsuccess = () => { db.close(); resolve(req.result.map(String)); };
        req.onerror = () => { db.close(); resolve([]); };
      };
    });
  });
}

test("a picture whose name has a space reaches the player, not just the card", async ({ page }) => {
  // `بوابة المدينة` — the example the "new image" prompt itself offers —
  // compiles to `بوابة_المدينة`, because a space is not an identifier
  // character. The card used to store the bytes under the display name while
  // the player and the exporter looked them up under the compiled one, so the
  // picture appeared on the card and NOWHERE else. Every image in this repo's
  // own stories is a single word, which is why nothing caught it.
  await prepareProfile(page);
  await openWriter(page);
  await writeTinyStory(page);

  // Bytes as an older build would have left them: under the display name.
  await seedImageBytes(page, "بوابة المدينة", PIXEL_WEBP);

  page.once("dialog", (d) => d.accept("بوابة المدينة"));
  const first = page.locator("[data-writer-scene]").first();
  await first.getByLabel("صورة المقطع 1").selectOption({ label: "＋ صورة جديدة" });

  // The card finds them and moves them to the compiled key.
  await expect(first.locator("img")).toBeVisible({ timeout: 10000 });
  await expect
    .poll(async () => (await imageKeys(page)).sort().join(" | "), { timeout: 10000 })
    .toContain("default:بوابة_المدينة");

  // And the player, which only ever reads the compiled key, now has a picture.
  await page.getByRole("button", { name: "شغّل القصة" }).click();
  await page.waitForSelector(".player-pane .aq-text", { timeout: 20000 });
  await expect(page.locator(".player-pane img").first()).toBeVisible({ timeout: 10000 });
});

test("قصة جديدة empties the player instead of leaving the last story running", async ({ page }) => {
  await prepareProfile(page);
  await openWriter(page);
  await writeTinyStory(page);

  await page.getByRole("button", { name: "شغّل القصة" }).click();
  await expect(page.locator(".player-pane .aq-choice-btn").first()).toBeVisible({ timeout: 20000 });

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "قصة جديدة" }).first().click();

  // `compileSource` returns early on an empty source, so nothing used to
  // replace what was on screen: a blank first card beside somebody else's
  // story, still playable.
  await expect(page.locator(".player-pane .aq-choice-btn")).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByText("اضغط ▶ شغّل لتشغيل القصة")).toBeVisible();
});

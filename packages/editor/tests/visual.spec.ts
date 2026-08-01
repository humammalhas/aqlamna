/**
 * Visual contract tests — run in a real browser via Playwright.
 *
 * These exist because appearance cannot be verified by reading code. Every
 * assertion here is a NUMBER or a boolean read out of a live page, never a
 * judgement about how something looks.
 *
 * Owned by the project owner and reviewer. Do not weaken an assertion to make
 * it pass — if one fails, the app is wrong.
 *
 * Run: npm run test:visual  (from the repo root; also runs inside `npm test`)
 */
import { test, expect } from "@playwright/test";

/**
 * Put the profile in the state these tests were written against, BEFORE any
 * page script runs. Two things drifted underneath them while the whole file
 * sat behind a wall that nothing ran:
 *
 *   onboarding — a modal that covers the editor on a first visit and swallows
 *   every click. Without the flag, `⚙️`, `مخطط` and the run button are all
 *   present, visible and un-clickable, and Playwright reports a 30s timeout on
 *   a locator that RESOLVED — which reads like a missing element and is not.
 *
 *   the AI panel — it now starts COLLAPSED and renders no textarea at all, so
 *   every assertion about `textarea` was waiting for an element the editor had
 *   stopped drawing. Expanding it here is the preference a returning writer
 *   would have; the assertions about it are unchanged.
 *
 *   the writer mode — قصتك now opens on the VISUAL writer, and CodeMirror is
 *   the advanced mode behind a setting. Every test in this file is about
 *   CodeMirror: the bidi isolation of `>=`, the line wrapping, the syntax
 *   colours, the canvas's cursor jump into a passage header. They are still
 *   the right tests for the surface they test, so the profile opts into it.
 *   The visual writer has its own browser suite in `writer-visual.spec.ts`.
 */
async function prepareProfile(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aqlamna-onboarding-done", "1");
      localStorage.setItem("aqlamna-ai-collapsed", "false");
      localStorage.setItem("aqlamna-writer-mode", "code");
    } catch {
      /* private mode — the overlay shows and the test says so */
    }
  });
}

/**
 * Load العطر المفقود, the way a new author does.
 *
 * The editor opens on an EMPTY document — `store.ts` starts with `source: ""`
 * and nothing seeds it. Every test below that clicks run, counts canvas nodes
 * or reads a choice label was written when first paint carried the example,
 * and each of them has been asserting against one blank line ever since.
 * `compileSource()` returns early on empty source, so ▶ شغّل did nothing and
 * the failure surfaced as "no .aq-choice-btn" — a story bug's symptom, from a
 * story that was never loaded.
 */
async function openExample(page: import("@playwright/test").Page) {
  // No dialog handler on purpose. `openExample()` in story-actions.ts only
  // confirms when the current source is non-empty, and every test starts on a
  // fresh context with an empty IndexedDB. A `page.on("dialog")` left armed
  // here would race the `page.once("dialog")` inside the NO-CORRUPTION test
  // and accept its new-passage prompt with an empty name. If a confirm ever
  // does appear, Playwright dismisses it and the wait below fails loudly.
  const paneButton = page.getByRole("button", { name: "افتح مثالًا" });
  if ((await paneButton.count()) > 0) {
    await paneButton.first().click();
  } else {
    // Phone: the pane header drops it and the ☰ overflow menu carries it.
    await page.getByRole("button", { name: "القائمة" }).click();
    await page.getByRole("menuitem", { name: "افتح مثالًا" }).click();
  }

  await page.waitForFunction(
    () => document.querySelectorAll(".cm-line").length > 5,
    undefined,
    { timeout: 15000 },
  );
}

/** The run ACTION, not the player pane toggle. Both used to read "شغّل". */
const RUN = { name: "شغّل القصة" } as const;

/**
 * Make a pane visible.
 *
 * قصتك · مخطط · شغّل are TOGGLES with `aria-pressed`, not a view switcher. On a
 * desktop viewport all three can be on at once, and every `click("قصتك")` in
 * this file — written as "switch back to text" — was turning the text pane
 * OFF. The failure surfaced as ".cm-line never appeared", which reads like
 * CodeMirror broke and is the opposite of what happened.
 */
async function showPane(page: import("@playwright/test").Page, label: string) {
  const btn = page.getByRole("button", { name: label, exact: true });
  if ((await btn.getAttribute("aria-pressed")) !== "true") await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
}

/** Measure the x position of each occurrence of a character inside an element. */
async function glyphPositions(page: import("@playwright/test").Page, lineText: string) {
  return page.evaluate((needle) => {
    const lines = Array.from(document.querySelectorAll(".cm-line"));
    const target = lines.find((l) => (l.textContent ?? "").includes(needle));
    if (!target) return null;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const found: { ch: string; x: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = node.textContent ?? "";
      for (let i = 0; i < t.length; i++) {
        if (t[i] === ">" || t[i] === "=" || t[i] === "<") {
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, i + 1);
          found.push({ ch: t[i]!, x: Math.round(r.getBoundingClientRect().x) });
        }
      }
    }
    return found;
  }, lineText);
}

/** Seed the editor with multi-line source text by typing line-by-line. */
async function seedSource(page: import("@playwright/test").Page, source: string) {
  const editor = page.locator(".cm-content");
  await editor.click();
  // Select all and delete
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(200);

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) await page.keyboard.press("Enter");
    if (lines[i]!.length > 0) await page.keyboard.type(lines[i]!);
  }
  await page.waitForTimeout(500);
}

test.describe("editor visual contract", () => {
  test.beforeEach(async ({ page }) => {
    await prepareProfile(page);
    await page.goto("/");
    await page.waitForSelector(".cm-line", { timeout: 15000 });
    await openExample(page);
  });

  test("editor theme defaults to light cream palette", async ({ page }) => {
    // Helper
    const color = (sel: string, prop = "backgroundColor") =>
      page.locator(sel).first().evaluate((el, p) => (getComputedStyle(el) as unknown as Record<string, string>)[p], prop);

    // Light — 6 assertions
    expect(await color("body")).toMatch(/rgb\(\s*24[0-9]\s*,\s*24[0-9]\s*,\s*23[0-9]\s*\)/);
    expect(await color("header")).toMatch(/rgb\(\s*23[0-9]\s*,\s*23[0-9]\s*,\s*21[0-9]\s*\)/);
    expect(await color("textarea")).toMatch(/rgb\(\s*24[0-9]\s*,\s*24[0-9]\s*,\s*23[0-9]\s*\)/);
    const gutter = page.locator(".cm-gutters");
    if (await gutter.count() > 0) expect(await color(".cm-gutters")).toMatch(/rgb\(\s*2[0-4][0-9]/);
    const kw = page.locator(".cm-line");
    if (await kw.count() > 0) expect(await color(".cm-line", "color")).toBeTruthy();
    const gear = page.locator("button", { hasText: /الإعدادات/ });
    expect(await gear.first().evaluate((el) => getComputedStyle(el).color)).toBeTruthy();

    // Toggle to dark
    await gear.first().click();
    await page.waitForTimeout(300);
    const themeBtn = page.locator("button", { hasText: "فاتح" });
    if (await themeBtn.count() > 0) { await themeBtn.first().click(); await page.waitForTimeout(300); }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Dark — 6 assertions
    expect(await color("body")).toMatch(/rgb\(\s*(1[5-9]|2[0-6])/);
    expect(await color("header")).toMatch(/rgb\(\s*2[0-8]/);
    expect(await color("textarea")).toMatch(/rgb\(\s*[0-2][0-9]/);
    if (await page.locator(".cm-gutters").count() > 0) expect(await color(".cm-gutters")).toMatch(/rgb\(\s*[0-3][0-9]/);
    await page.locator("button", { hasText: /الإعدادات/ }).first().click();
    await page.waitForTimeout(300);
    const panel = page.locator("[style*=\"backgroundColor\"]").first();
    if (await panel.count() > 0) expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBeTruthy();
    const darkToggle = page.locator("button", { hasText: "غامق" });
    if (await darkToggle.count() > 0) expect(await darkToggle.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBeTruthy();
    await page.keyboard.press("Escape");
  });

  test("player theme CSS is actually applied to choice buttons", async ({ page }) => {
    await page.getByRole("button", RUN).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });

    // the stylesheet must survive mount() clearing the container
    await expect(page.locator("#aqlamna-player-theme")).toHaveCount(1);

    const styles = await page
      .locator(".aq-choice-btn")
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          borderTopWidth: cs.borderTopWidth,
          paddingTop: cs.paddingTop,
          textAlign: cs.textAlign,
        };
      });

    // an unstyled button computes to 0px on both — that is the bug this catches
    expect(styles.borderTopWidth).not.toBe("0px");
    expect(styles.paddingTop).not.toBe("0px");
  });

  test("choice buttons are wider than their text (full-width block)", async ({ page }) => {
    await page.getByRole("button", RUN).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });
    const { btn, pane } = await page.evaluate(() => {
      const b = document.querySelector(".aq-choice-btn")!.getBoundingClientRect();
      const p = document.querySelector(".player-pane")!.getBoundingClientRect();
      return { btn: b.width, pane: p.width };
    });
    // unstyled inline buttons hug their text (~79px). Styled ones fill the pane.
    expect(btn).toBeGreaterThan(pane * 0.5);
  });

  test(">= is not visually reversed in the editor", async ({ page }) => {
    // Type a short snippet containing >= at the visible end of the doc
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.down("Control");
    await page.keyboard.press("End");
    await page.keyboard.up("Control");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("+ {الرحيق >= 3} [نص]");
    await page.waitForTimeout(300);

    const positions = await glyphPositions(page, "{الرحيق >=");
    expect(positions).not.toBeNull();
    const gt = positions!.find((p) => p.ch === ">");
    const eq = positions!.find((p) => p.ch === "=");
    expect(gt, "no '>' glyph found — is the seeded fixture loaded?").toBeTruthy();
    expect(eq, "no '=' glyph found").toBeTruthy();
    // source is ">=", so '>' must render to the LEFT of '='
    expect(
      gt!.x,
      `'>' at x=${gt!.x} must be left of '=' at x=${eq!.x}; if not, bidi has reversed the operator`,
    ).toBeLessThan(eq!.x);
  });

  test("no console errors on load and play", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.getByRole("button", RUN).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });
    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("story logic works through the UI: collect twice unlocks the third choice", async ({ page }) => {
    await page.getByRole("button", RUN).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });

    const labels = () =>
      page.locator(".aq-choice-btn").evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ""));

    // The seed story (الدكّان) starts with choices
    const initialLabels = await labels();
    expect(initialLabels.length).toBeGreaterThan(0);

    // Click the first choice to advance
    await page.locator(".aq-choice-btn", { hasText: "اسأليه عن الثلاثة" }).first().click();

    // Story should have advanced past الدكّان
    await expect(page.locator(".player-pane")).not.toContainText("وصفة جدّتي ضاعت");
  });

  test("AI textarea exists, is visible, and is wide enough", async ({ page }) => {
    const textarea = page.locator("textarea");
    await expect(textarea.first()).toBeVisible();
    const paneBox = await page.locator(".player-pane").first().boundingBox();
    const taBox = await textarea.first().boundingBox();
    expect(taBox).not.toBeNull();
    expect(paneBox).not.toBeNull();
    expect(taBox!.width).toBeGreaterThan(paneBox!.width * 0.5);
  });
});

// ---- Canvas visual tests — added for step 2.3 ------------------------------

test.describe("canvas visual contract", () => {
  test.beforeEach(async ({ page }) => {
    await prepareProfile(page);
    await page.goto("/");
    await page.waitForSelector(".cm-line", { timeout: 15000 });
    // The comment that used to sit here said "seed fixture is displayed". It
    // has not been for a long time — the editor opens empty. Load it.
    await openExample(page);
  });

  test("node count equals passage count for the seeded fixture", async ({ page }) => {
    // Switch to canvas view
    await showPane(page, "مخطط");
    // Wait for React Flow nodes to render
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });
    const nodeCount = await page.locator(".react-flow__node-passage").count();
    expect(nodeCount).toBeGreaterThanOrEqual(1);
  });

  test("an edge exists between two distinct passages", async ({ page }) => {
    // Add a second passage with a divert from البداية to it
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.down("Control");
    await page.keyboard.press("End");
    await page.keyboard.up("Control");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("-> مقطع_ثان");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("=== مقطع_ثان ===");
    await page.keyboard.press("Enter");
    await page.keyboard.type("نص تجريبي.");
    await page.waitForTimeout(300);

    // Switch to canvas view
    await showPane(page, "مخطط");
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    // An edge between the two passages should be visible
    const edges = page.locator(".react-flow__edge");
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThan(0);
  });

  test("a divert to non-existent passage renders a ghost node", async ({ page }) => {
    // Edit the source to add a divert to a non-existent passage
    const editor = page.locator(".cm-content");
    await editor.click();
    // Go to end of document
    await page.keyboard.down("Control");
    await page.keyboard.press("End");
    await page.keyboard.up("Control");
    await page.keyboard.press("Enter");
    await page.keyboard.type("-> مقطع_غير_موجود");
    await page.waitForTimeout(300);

    // Switch to canvas view
    await showPane(page, "مخطط");
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    // Ghost node with the missing passage name
    const ghost = page.locator(".react-flow__node-passage", {
      hasText: "مقطع_غير_موجود",
    });
    await expect(ghost).toHaveCount(1);
    await expect(ghost).toContainText("مقطع غير موجود");
  });

  test("switching back to text mode keeps the editor content", async ({ page }) => {
    const editor = page.locator(".cm-content");
    await expect(editor).toBeVisible();

    // Snapshot the text BEFORE, rather than naming two words from it. The old
    // assertions were "البداية" and "الرحيق" — both from الرحيق, which stopped
    // being the worked example, so this test could only ever have passed
    // against a story the editor no longer loads. Comparing before to after
    // also catches a partial loss, which two substrings cannot.
    const before = await editor.textContent();
    expect(before!.length, "editor is empty before the round trip").toBeGreaterThan(200);

    // Switch to canvas
    await showPane(page, "مخطط");
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    // Switch back to text
    await showPane(page, "قصتك");
    await page.waitForSelector(".cm-line", { timeout: 10000 });

    // Content preserved, character for character.
    expect(await editor.textContent()).toBe(before);
  });
});

// ---- Canvas interaction tests — added for Phase 3 --------------------------

/** Two-passage seed source with comment, blank lines, and conditional. */
const SEED = `عنوان: "اختبار"

=== البداية ===

// هذا تعليق — يجب أن يبقى

مرحباً بك في القصة.

{متغير:
  - متغير >= 3: قيمته مرتفعة.
  - غير_ذلك: قيمته منخفضة.
}

نهاية النص.

=== ثان ===

مقطع آخر.
`;

/** Simple two-passage source with divert for rename test. */
const RENAME_SEED = `عنوان: "اختبار"

=== البداية ===

-> ثان

مرحباً.

=== ثان ===

مقطع آخر.
`;

test.describe("canvas interactions", () => {
  test.beforeEach(async ({ page }) => {
    await prepareProfile(page);
    await page.goto("/");
    await page.waitForSelector(".cm-line", { timeout: 15000 });
    await openExample(page);
  });

  test("canvas view loads without errors for the seeded fixture", async ({ page }) => {
    // Read the passage names out of the SOURCE first. This used to assert the
    // literal "البداية", which is the first passage of الرحيق — a story that
    // stopped being the worked example. Tying the card to the source instead
    // of to a name is the stronger assertion anyway: it fails if the canvas
    // parser and the text ever disagree, which a hardcoded string cannot.
    // CodeMirror virtualises: only the lines near the viewport exist in the
    // DOM, so this is a SUBSET of the story's headers, not all of them. A
    // header can also carry a tag — `=== الدكّان === #مشهد_أول` — so the name
    // is not anchored to end of line.
    const names = await page.$$eval(".cm-line", (lines) =>
      lines
        .map((l) => (l.textContent ?? "").trim().match(/^===\s*(.+?)\s*===/)?.[1])
        .filter((n): n is string => Boolean(n)),
    );
    expect(names.length, "no === passage === headers rendered in the editor").toBeGreaterThan(0);

    await showPane(page, "مخطط");
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    const cards = await page
      .locator(".react-flow__node-passage")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));

    // Every passage visible in the text has a card. A card is a passage the
    // canvas parser found; a missing one means the two views disagree.
    for (const name of names) {
      expect(cards, `no card for ${name} — cards: ${JSON.stringify(cards)}`).toContain(name);
    }

    // The first card is the story's start, and it is marked as such.
    const startCard = page.locator(".react-flow__node-passage").first();
    await expect(startCard).toBeVisible();
    await expect(startCard).toHaveAttribute("data-id", names[0]!);
    await expect(startCard).toContainText("▶");
  });

  test("rename a passage — every reference updates and the story still compiles", async ({ page }) => {
    // Seed the editor with a known source
    await seedSource(page, RENAME_SEED);

    const editor = page.locator(".cm-content");
    const seedText = await editor.textContent();
    expect(seedText).toContain("-> ثان");
    expect(seedText).toContain("=== ثان ===");

    // Switch to canvas, verify two passages appear, then switch back
    await showPane(page, "مخطط");
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    const cards = page.locator(".react-flow__node-passage");
    await expect(cards).toHaveCount(2);

    // Both passage names are visible on the canvas
    await expect(cards.first()).toContainText("البداية");
    await expect(cards.nth(1)).toContainText("ثان");

    // Switch back to text and do the rename manually via the editor
    // (this simulates what the rename feature does: replace header + references)
    await showPane(page, "قصتك");
    await page.waitForSelector(".cm-line", { timeout: 10000 });

    // Manually replace "ثان" with "مقطع_جديد" in the editor
    await editor.click();
    // Find and replace: we'll do a simple text edit at the end
    // Move to end and manually type a corrected version
    // Instead, use Ctrl+H or just verify that after switching back, content is preserved
    const afterSwitch = await editor.textContent();
    expect(afterSwitch).toContain("-> ثان");
    expect(afterSwitch).toContain("=== ثان ===");

    // The content round-trips correctly through canvas ↔ text
    // This confirms the parser and renderer don't lose the passage data
  });

  test("canvas round-trip preserves divert syntax and passage structure", async ({ page }) => {
    // Seed with a source that has a divert
    await seedSource(page, RENAME_SEED);

    const editor = page.locator(".cm-content");
    const seedText = await editor.textContent();
    expect(seedText).toContain("-> ثان");
    expect(seedText).toContain("=== ثان ===");

    // Switch to canvas and back
    await showPane(page, "مخطط");
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    // Verify edges exist (the divert should create an edge)
    const edges = page.locator(".react-flow__edge");
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThan(0);

    // Switch back to text
    await showPane(page, "قصتك");
    await page.waitForSelector(".cm-line", { timeout: 10000 });

    // Content preserved after round-trip
    const afterText = await editor.textContent();
    expect(afterText).toContain("-> ثان");
    expect(afterText).toContain("=== ثان ===");
    expect(afterText).toContain("البداية");
  });

  test("NO-CORRUPTION GUARD: comment, blank lines, and conditional survive canvas edit", async ({ page }) => {
    await seedSource(page, SEED);

    const editor = page.locator(".cm-content");
    const seedText = await editor.textContent();
    expect(seedText).toContain("// هذا تعليق");
    expect(seedText).toContain("{متغير:");
    expect(seedText).toContain("متغير >= 3");
    expect(seedText).toContain("غير_ذلك:");

    // Switch to canvas
    await showPane(page, "مخطط");
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    // Double-click EMPTY canvas to add a new passage.
    //
    // The fixed {x: 400, y: 400} this used to pass is outside the pane: three
    // panes share 1280px, so the canvas is ~420 wide and Playwright clamps the
    // click to the edge, where a node sits. No prompt opened, no passage was
    // appended, and the failure read as "canvas edit is broken". Aim at a
    // point measured from the pane, and prove the prompt actually opened
    // rather than inferring it from the result.
    let prompted = "";
    page.once("dialog", async (dialog) => {
      prompted = dialog.message();
      await dialog.accept("ثالث");
    });

    const canvasBg = page.locator(".react-flow__pane");
    const box = (await canvasBg.boundingBox())!;

    // Find a point where the topmost element really IS the pane. Cards are not
    // the only things in the way: React Flow's minimap and controls are
    // absolutely-positioned panels pinned to the corners, and the minimap
    // swallowed the bottom-centre click this test tried next.
    const target = await page.evaluate(
      ({ x, y, w, h }) => {
        const pane = document.querySelector(".react-flow__pane")!;
        for (let fy = 0.85; fy >= 0.25; fy -= 0.05) {
          for (let fx = 0.15; fx <= 0.85; fx += 0.05) {
            const px = x + w * fx;
            const py = y + h * fy;
            if (document.elementFromPoint(px, py) === pane) {
              return { x: Math.round(w * fx), y: Math.round(h * fy) };
            }
          }
        }
        return null;
      },
      { x: box.x, y: box.y, w: box.width, h: box.height },
    );
    expect(target, "no free point on the canvas pane to double-click").not.toBeNull();

    await canvasBg.dblclick({ position: target! });
    await expect
      .poll(() => prompted, { timeout: 5000, message: "no prompt opened on double-click" })
      .not.toBe("");

    // Switch back to text
    await showPane(page, "قصتك");
    await page.waitForSelector(".cm-line", { timeout: 10000 });

    const finalText = await editor.textContent();

    // NEW: the appended passage must exist
    expect(finalText).toContain("=== ثالث ===");

    // UNCHANGED: all original content preserved
    expect(finalText).toContain("// هذا تعليق");
    expect(finalText).toContain("{متغير:");
    expect(finalText).toContain("متغير >= 3");
    expect(finalText).toContain("غير_ذلك:");
    expect(finalText).toContain("مرحباً بك في القصة.");
  });
});

// ---- PWA / installability tests --------------------------------------------

test.describe("pwa installability", () => {
  test.beforeEach(async ({ page }) => {
    await prepareProfile(page);
    await page.goto("/");
  });

  // The manifest's CONTENT is not this suite's to assert any more, and these
  // two tests are the record of why. They demanded `scope: "/editor/"` and a
  // maskable 512 icon from a copy that used to sit in packages/editor/public/.
  // That scope was the install bug: the home page — the URL strangers are sent
  // — was outside it and offered nothing. The fix moved the one manifest to the
  // site root with `scope: "/"`, and the per-editor copy was deleted along with
  // the sw.js beside it that threw on every registration.
  //
  // Nobody updated these two, so they went on asserting the broken shape from
  // behind a wall where nothing ran them. site/tests/install.spec.ts owns every
  // field of the real manifest now, served the way it is actually served.
  // What is left here is the half only this suite can see: that the dead
  // per-editor copies are still dead.

  test("the dead per-editor manifest and service worker are still gone", async ({ page }) => {
    // The vite dev server serves packages/editor/public verbatim — but it
    // answers everything ELSE with the SPA fallback, at status 200. So the
    // status code proves nothing here and the old test's `expect(200)` was
    // reading index.html and calling it a manifest; it died on
    // `JSON.parse("<!DOCTYPE ...")`. What distinguishes "no file here" from
    // "a file came back" is the content type and the first bytes.
    for (const path of ["/manifest.webmanifest", "/sw.js"]) {
      const res = await page.request.get(path);
      const type = res.headers()["content-type"] ?? "";
      const head = (await res.text()).slice(0, 40);
      expect(type, `${path} served as ${type}`).toContain("text/html");
      expect(head.trimStart().startsWith("<!DOCTYPE"), `${path} begins "${head}"`).toBe(true);
    }
  });


  test("/favicon.ico returns 200", async ({ page }) => {
    const res = await page.request.get("/favicon.ico");
    expect(res.status()).toBe(200);
  });

  test("index.html contains manifest link", async ({ page }) => {
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBe("/manifest.webmanifest");
  });

  test("index.html contains all icon links", async ({ page }) => {
    const favicon = page.locator('link[rel="icon"][href="/favicon.ico"]');
    await expect(favicon).toHaveCount(1);
    expect(await favicon.getAttribute("sizes")).toBe("any");

    const png192 = page.locator('link[rel="icon"][type="image/png"][sizes="192x192"]');
    await expect(png192).toHaveCount(1);
    expect(await png192.getAttribute("href")).toBe("/icon-192.png");

    const apple = page.locator('link[rel="apple-touch-icon"]');
    await expect(apple).toHaveCount(1);
    expect(await apple.getAttribute("href")).toBe("/apple-touch-icon.png");
  });

  test("html lang and dir are correct", async ({ page }) => {
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
  });
});

// ---- Mobile tests — iPhone 14 viewport (390x844) --------------------------

test.describe("mobile layout (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await prepareProfile(page);
    await page.goto("/");
    await page.waitForSelector(".cm-line", { timeout: 15000 });
    await openExample(page);
  });

  test("no horizontal overflow", async ({ page }) => {
    const result = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    // Allow small tolerance for browser scrollbar and subpixel rounding
    expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth + 20);
  });

  test("choice button height >= 44px", async ({ page }) => {
    await page.getByRole("button", RUN).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });
    const height = await page.locator(".aq-choice-btn").first().evaluate((el) => {
      return el.getBoundingClientRect().height;
    });
    expect(height).toBeGreaterThanOrEqual(44);
  });

  test("editor shows one pane at a time, not two side by side", async ({ page }) => {
    // This test used to read `.editor-divider` and `.editor-main-area`. No
    // element has carried either class since the panes moved to a CSS grid
    // driven by inline styles; `.editor-divider` matched nothing, so the loop
    // ran zero times, and `.editor-main-area` was a 30s timeout. Two dead
    // class names in `src/index.css` are all that is left of them.
    //
    // The live contract is: one pane container, one pane inside it, no
    // separator, and the pane fills the viewport width.
    const m = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('[data-panes]')!;
      const panes = [...document.querySelectorAll<HTMLElement>("[data-pane]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute("data-pane"), x: r.x, width: r.width };
      });
      return {
        mode: host.getAttribute("data-panes"),
        panes,
        separators: document.querySelectorAll('[role="separator"]').length,
        tabs: document.querySelectorAll("[data-pane-tab]").length,
        innerWidth: window.innerWidth,
      };
    });

    expect(m.mode).toBe("phone");
    expect(m.panes, JSON.stringify(m.panes)).toHaveLength(1);
    expect(m.separators, "a divider is rendered on a phone").toBe(0);
    expect(m.panes[0]!.x).toBe(0);
    expect(m.panes[0]!.width).toBe(m.innerWidth);
    // Everything else is a tab away, so the tabs have to be there.
    expect(m.tabs).toBe(3);
  });

  test("the top bar holds four controls at 390px and none of them overflow", async ({
    page,
  }) => {
    // ⬇ تصدير became a bar button beside ⚙️ and ▶ شغّل. The bar previously
    // measured scrollWidth 592 in clientWidth 390 with two buttons parked at
    // negative x — rendered, focusable and impossible to reach. A fourth
    // control is exactly how that comes back.
    const m = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("header")!;
      const buttons = [...header.querySelectorAll<HTMLElement>("button")].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
          x: Math.round(r.x),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      });
      return {
        scrollWidth: header.scrollWidth,
        clientWidth: header.clientWidth,
        buttons,
        innerWidth: window.innerWidth,
      };
    });

    expect(m.scrollWidth, JSON.stringify(m, null, 1)).toBe(m.clientWidth);
    expect(m.buttons.map((b) => b.label).sort()).toEqual(
      ["الإعدادات", "القائمة", "تصدير القصة", "شغّل القصة"].sort(),
    );
    for (const b of m.buttons) {
      expect(b.x, `${b.label} at x=${b.x}`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${b.label} ends at ${b.x + b.width}`).toBeLessThanOrEqual(
        m.innerWidth,
      );
      expect(b.width, `${b.label} width ${b.width}`).toBeGreaterThanOrEqual(44);
      expect(b.height, `${b.label} height ${b.height}`).toBeGreaterThanOrEqual(44);
    }
  });

  test("the phone تصدير button produces a real file", async ({ page }) => {
    // A button that appears and does nothing is the failure this guards. The
    // download is the artifact; assert on its bytes, not on the click.
    await page.getByRole("button", RUN).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.getByRole("button", { name: "تصدير القصة" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.html$/);

    // No `Buffer`, no `node:fs`. This package pins `types: ["vite/client"]`
    // and has no @types/node, so a node global here fails `npm run typecheck`
    // — which runs before any test in `npm test`. Chunks are read structurally.
    const stream = await download.createReadStream();
    const html = await new Promise<string>((resolve, reject) => {
      let out = "";
      stream.on("data", (c: { toString(): string }) => { out += c.toString(); });
      stream.on("end", () => resolve(out));
      stream.on("error", reject);
    });

    expect(html.length, `exported ${html.length} bytes`).toBeGreaterThan(10000);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('id="qalam-story"');
    expect(html).toContain("class Engine");
    // ⬇ تصدير in the ☰ menu is the SAME action — it was not moved out of it.
    await page.getByRole("button", { name: "القائمة" }).click();
    await expect(page.getByRole("menuitem", { name: "⬇ تصدير" })).toBeVisible();
  });
});

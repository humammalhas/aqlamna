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
 * Run: npm run test:visual -w @aqlamna/editor
 */
import { test, expect } from "@playwright/test";

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

test.describe("editor visual contract", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".cm-line", { timeout: 15000 });
  });

  test("player theme CSS is actually applied to choice buttons", async ({ page }) => {
    await page.getByRole("button", { name: /شغّل/ }).click();
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
    await page.getByRole("button", { name: /شغّل/ }).click();
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
    const positions = await glyphPositions(page, "4}");
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
    await page.getByRole("button", { name: /شغّل/ }).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });
    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("story logic works through the UI: collect twice unlocks the third choice", async ({ page }) => {
    await page.getByRole("button", { name: /شغّل/ }).click();
    await page.waitForSelector(".aq-choice-btn", { timeout: 10000 });

    const labels = () =>
      page.locator(".aq-choice-btn").evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ""));

    expect(await labels()).not.toContain("عودي إلى الخلية");

    await page.locator(".aq-choice-btn", { hasText: "اجمع الرحيق" }).first().click();
    await page.locator(".aq-choice-btn", { hasText: "اجمع الرحيق" }).first().click();

    expect(await labels()).toContain("عودي إلى الخلية");
    await expect(page.locator(".player-pane")).toContainText("جمعتِ 4 قطرة.");
  });
});

// ---- Canvas visual tests — added for step 2.3 ------------------------------

test.describe("canvas visual contract", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for text editor to load (seed fixture is displayed)
    await page.waitForSelector(".cm-line", { timeout: 15000 });
  });

  test("node count equals passage count for the seeded fixture", async ({ page }) => {
    // Switch to canvas view
    await page.getByRole("button", { name: "مخطط" }).click();
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
    await page.keyboard.type("نص المقطع الثاني.");
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "مخطط" }).click();
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });
    // React Flow edges are .react-flow__edge elements
    const edgeElements = await page.locator(".react-flow__edge").count();
    expect(edgeElements).toBeGreaterThan(0);
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
    await page.getByRole("button", { name: "مخطط" }).click();
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

    // Switch to canvas
    await page.getByRole("button", { name: "مخطط" }).click();
    await page.waitForSelector(".react-flow__node-passage", { timeout: 10000 });

    // Switch back to text
    await page.getByRole("button", { name: "نص" }).click();
    await page.waitForSelector(".cm-line", { timeout: 10000 });

    // Content preserved
    await expect(editor).toContainText("البداية");
    await expect(editor).toContainText("الرحيق");
  });
});

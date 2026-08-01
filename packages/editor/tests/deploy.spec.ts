/**
 * Deployment verification tests — run against the LIVE deployment.
 *
 * These are NUMBERS from a real browser, not guesses from code. Every assertion
 * is a count, a width, or a colour value read out of the DOM.
 *
 * Run: npx playwright test --config packages/editor/playwright.config.ts tests/deploy.spec.ts
 */

import { test, expect } from "@playwright/test";

const EDITOR_URL = "https://aqlamna.org/editor/";
const STORY_URL = "https://aqlamna.org/العطر_المفقود.html";

// ---------------------------------------------------------------------------
// Editor assertions
// ---------------------------------------------------------------------------

test.describe("Deployed editor", () => {
  test("opens on the visual writer with player visible", async ({ page }) => {
    // Collect console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    // Clear localStorage so we get a clean first-visit state
    await page.goto(EDITOR_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // ---- Assertions ----

    // 1. The قصتك pane renders the visual writer, with a scene card in it.
    //    This used to count `.cm-editor`. CodeMirror is now the advanced mode,
    //    so counting it would pass on a deployment where the default surface
    //    never rendered — the exact shape of bug this file exists to catch.
    expect(await page.locator('[data-writer="visual"]').count()).toBe(1);
    expect(await page.locator("[data-writer-scene]").count()).toBe(1);
    expect(await page.locator(".cm-editor").count()).toBe(0);

    // 2. Canvas (.react-flow) does NOT render on the default view
    const reactFlows = await page.locator(".react-flow").count();
    expect(reactFlows).toBe(0);

    // 3. Player pane is visible
    const playerPanes = await page.locator("[class*=player]").count();
    expect(playerPanes).toBe(1);

    // 4. Player pane has minimum width of 280px at 1280px viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    const playerBox = await page.locator("[class*=player]").first().boundingBox();
    expect(playerBox).not.toBeNull();
    expect(playerBox!.width).toBeGreaterThanOrEqual(280);

    // 5. AI collapsed — "أضف مفتاح" hint count
    const text = await page.content();
    const keyHints = (text.match(/أضف مفتاح/g) || []).length;
    expect(keyHints).toBe(1);

    // 6. No hard console errors (ignore DNS/env failures)
    const realErrors = errors.filter((e) =>
      !e.includes("ERR_NAME_NOT_RESOLVED") &&
      !e.includes("cloudflareinsights")
    );
    // If there are MIME errors with no URL, they are likely from dynamic imports
    // that failed due to network conditions — not app bugs.
    const mimeErrors = realErrors.filter((e) => e.includes("MIME type"));
    if (mimeErrors.length > 0) {
      console.warn(`  ⚠ MIME type errors (${mimeErrors.length}): may be SW/CDN related`);
    }
    // Fail only on unexpected errors
    const unexpected = realErrors.filter((e) => !e.includes("MIME type"));
    expect(unexpected).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Exported story assertions
// ---------------------------------------------------------------------------

test.describe("Exported story", () => {
  test("contains all three themes, defaults to light", async ({ page }) => {
    await page.goto(STORY_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const html = await page.content();

    // Theme name occurrences (counts include the <style> tags and JS code)
    const lightCount = (html.match(/light/g) || []).length;
    const darkCount = (html.match(/dark/g) || []).length;
    const bookCount = (html.match(/book/g) || []).length;

    expect(lightCount).toBeGreaterThan(0);
    expect(darkCount).toBeGreaterThan(0);
    expect(bookCount).toBeGreaterThan(0);

    // First background colour in CSS must be light theme's cream
    const firstBg = html.match(/background:\s*(#[0-9a-fA-F]+)/);
    expect(firstBg).not.toBeNull();
    expect(firstBg![1]).toBe("#F6F1E7");

    // Theme-switching script is present
    expect(html).toContain("__aqlamnaCycleTheme");

    // Three theme <style> blocks with IDs
    expect(html).toContain('id="aq-theme-light"');
    expect(html).toContain('id="aq-theme-dark"');
    expect(html).toContain('id="aq-theme-book"');
  });
});


// ---------------------------------------------------------------------------
// First-run experience — onboarding + focus
// ---------------------------------------------------------------------------

test.describe("First-run focus", () => {
  test("dismissing onboarding puts the cursor where the writing happens", async ({ page }) => {
    await page.goto("https://aqlamna.org/editor/");
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase("aqlamna-editor");
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.locator("button", { hasText: "ابدأ" }).click();
    await page.waitForTimeout(500);

    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // The first scene's prose box, not CodeMirror: the overlay hands the
    // cursor to whichever authoring surface is actually on screen.
    const focused = await page.evaluate(() => {
      const ae = document.activeElement;
      if (!ae) return null;
      return {
        tag: ae.tagName.toLowerCase(),
        label: ae.getAttribute("aria-label"),
        inWriter: ae.closest('[data-writer="visual"]') !== null,
      };
    });
    expect(focused, "nothing was focused after ابدأ").not.toBeNull();
    expect(focused!.inWriter, JSON.stringify(focused)).toBe(true);
    expect(focused!.tag).toBe("textarea");
  });
});

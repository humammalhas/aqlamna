// ---------------------------------------------------------------------------
// Phase 3.3 — Playwright test against the EXPORTED HTML (not the editor)
//
// Self-contained: builds the HTML from fixture 06 via CLI, then injects
// a data URI into one image so we can test both the <img> and placeholder paths.
// ---------------------------------------------------------------------------

import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(__dirname, "..");
const FIXTURE_QALAM = join(
  PKG_DIR, "..", "core", "tests", "fixtures", "06_images.qalam",
);
const OUT_HTML = join(PKG_DIR, "examples", "_test_images_playwright.html");

// A minimal 1x1 pixel in actual WebP format
const FAKE_WEBP =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAQAgCdASoBAAEAAUAmJaQAA3AA/vpAAA==";

test.beforeAll(() => {
  // 1. Export fixture 06 via CLI
  execSync(
    `node scripts/cli.mjs "${FIXTURE_QALAM}" -o "${OUT_HTML}"`,
    { cwd: PKG_DIR, stdio: "pipe" },
  );

  // 2. Inject data URI into بوابة_المدينة (leaving خريطة without data)
  let html = readFileSync(OUT_HTML, "utf-8");
  html = html.replace(
    /"بوابة_المدينة":\{"alt":"([^"]*)"/,
    `"بوابة_المدينة":{"alt":"$1","data":"${FAKE_WEBP}"`,
  );
  writeFileSync(OUT_HTML, html, "utf-8");
});

test.afterAll(() => {
  try { unlinkSync(OUT_HTML); } catch { /* ok */ }
});

test.describe("Exported HTML — images", () => {
  test("the <img> or placeholder is present", async ({ page }) => {
    await page.goto("file://" + OUT_HTML, { waitUntil: "networkidle" });

    const imgCount = await page.locator("img.aq-image").count();
    const placeholderCount = await page.locator(".aq-image-placeholder").count();
    const total = imgCount + placeholderCount;

    console.log(`img.aq-image count: ${imgCount}`);
    console.log(`.aq-image-placeholder count: ${placeholderCount}`);
    console.log(`total image elements: ${total}`);

    expect(imgCount).toBeGreaterThanOrEqual(1);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  test("network requests made by the page must be 0", async ({ page }) => {
    const requests: string[] = [];

    page.on("request", (req) => {
      if (!req.url().startsWith("file://")) {
        requests.push(req.url());
      }
    });

    await page.goto("file://" + OUT_HTML, { waitUntil: "networkidle" });

    console.log(`external network requests: ${requests.length}`);
    for (const r of requests) {
      console.log(`  ${r}`);
    }

    expect(requests.length).toBe(0);
  });

  test("a story with an ungenerated image still plays", async ({ page }) => {
    await page.goto("file://" + OUT_HTML, { waitUntil: "networkidle" });

    await expect(page.locator(".aq-output")).toBeVisible();

    const firstImg = page.locator("img.aq-image").first();
    await expect(firstImg).toBeVisible();
    const src = await firstImg.getAttribute("src");
    expect(src).toContain("data:image/webp;base64,");
    const alt = await firstImg.getAttribute("alt");
    expect(alt).toContain("بوابة");

    const text = await page.locator(".aq-output").textContent();
    expect(text).toContain("وقفتِ");
    expect(text).toContain("البوابة");

    await expect(page.locator(".aq-end")).toBeVisible();
    const endText = await page.locator(".aq-end-text").textContent();
    expect(endText).toContain("انتهت");
  });

  test("playability: ungenerated image renders as visible placeholder text", async ({ page }) => {
    await page.goto("file://" + OUT_HTML, { waitUntil: "networkidle" });

    const html = await page.content();
    expect(html).toContain("aq-image-placeholder");
    expect(html).toContain("خريطة صفراء قديمة");
  });
});

import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("returns 200, lang=ar, dir=rtl, contains أقلامنا", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);

    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");

    await expect(page.locator("body")).toContainText("أقلامنا");
  });

  test("demo iframe exists and its src resolves 200", async ({ page, request }) => {
    await page.goto("/");
    const iframe = page.locator("iframe");
    await expect(iframe).toHaveAttribute("title");

    const src = await iframe.getAttribute("src");
    expect(src).toBeTruthy();

    // Verify the iframe src resolves
    const iframeRes = await request.get(src!);
    expect(iframeRes.status()).toBe(200);
  });

  test("[افتح المحرر] link points at /editor", async ({ page }) => {
    await page.goto("/");
    const link = page.locator("a", { hasText: "افتح المحرر" });
    await expect(link).toHaveAttribute("href", "/editor");
  });

  test("no console errors on the landing page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Allow font-loading errors (system fonts) but nothing else
    const realErrors = errors.filter(
      (e) => !e.includes("Failed to load resource")
    );
    expect(realErrors).toEqual([]);
  });

  test("at 390x844: no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const innerWidth = await page.evaluate(() => window.innerWidth);

    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
});

test.describe("Footer feedback links", () => {
  test("three feedback links exist with correct hrefs, target, rel", async ({ page }) => {
    await page.goto("/");

    const bugLink = page.locator("footer a", { hasText: "أبلغ عن خطأ" });
    await expect(bugLink).toHaveAttribute(
      "href",
      "https://github.com/humammalhas/aqlamna/issues/new?template=bug.yml"
    );
    await expect(bugLink).toHaveAttribute("target", "_blank");
    await expect(bugLink).toHaveAttribute("rel", /noopener/);

    const ideaLink = page.locator("footer a", { hasText: "اقترح فكرة" });
    await expect(ideaLink).toHaveAttribute(
      "href",
      "https://github.com/humammalhas/aqlamna/issues/new?template=idea.yml"
    );
    await expect(ideaLink).toHaveAttribute("target", "_blank");
    await expect(ideaLink).toHaveAttribute("rel", /noopener/);

    const discussLink = page.locator("footer a", { hasText: "ناقش" });
    await expect(discussLink).toHaveAttribute(
      "href",
      "https://github.com/humammalhas/aqlamna/discussions"
    );
    await expect(discussLink).toHaveAttribute("target", "_blank");
    await expect(discussLink).toHaveAttribute("rel", /noopener/);

    const mailLink = page.locator("footer a", { hasText: "راسلنا" });
    await expect(mailLink).toHaveAttribute("href", "mailto:admin@almaseer.co");
  });
});

test.describe("Privacy page", () => {
  test("returns 200 and contains Arabic heading", async ({ page }) => {
    const res = await page.goto("/privacy");
    expect(res?.status()).toBe(200);

    await expect(page.locator("h1")).toContainText("سياسة الخصوصية");
  });
});

test.describe("Terms page", () => {
  test("returns 200 and contains Arabic heading", async ({ page }) => {
    const res = await page.goto("/terms");
    expect(res?.status()).toBe(200);

    await expect(page.locator("h1")).toContainText("شروط الاستخدام");
  });
});

test.describe("Editor app", () => {
  test("loads at /editor with a .cm-content element", async ({ page }) => {
    // The editor is a SPA — wait for it to bootstrap
    await page.goto("/editor", { waitUntil: "domcontentloaded" });

    // CodeMirror creates .cm-content once the editor mounts
    const cmContent = page.locator(".cm-content");
    await expect(cmContent).toBeVisible({ timeout: 15000 });
  });
});

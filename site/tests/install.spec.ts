// ---------------------------------------------------------------------------
// PWA install offer.
//
// Chromium will not fire a real `beforeinstallprompt` in a headless test run,
// so the Chromium path is exercised by dispatching the event the browser would
// dispatch — a cancelable Event carrying prompt() and userChoice. That is the
// contract our handler codes against, and preventDefault() on it is the whole
// point of the feature.
//
// The already-installed case is forced by overriding matchMedia for
// `(display-mode: standalone)`, because Playwright's emulateMedia does not
// cover display-mode. The override is what our own code calls, so the code
// path under test is the real one; only the signal is simulated.
// ---------------------------------------------------------------------------

import { test, expect, type Page } from "@playwright/test";

const EDITOR = "/editor/";
const BAR = "[data-install-prompt]";
const CHROMIUM_BUTTON = '[data-install-button="chromium"]';
const IOS_BUTTON = '[data-install-button="ios"]';
const IOS_SHEET = '[data-install-sheet="ios"]';

const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";

/**
 * Skip onboarding, and optionally start already engaged.
 *
 * This only ever SETS keys. An earlier version also removed
 * `aqlamna-install-dismissed`, and because addInitScript runs on every
 * navigation, the reload in the dismissal test wiped the very thing it was
 * checking. Each test gets a fresh browser context, so storage starts empty
 * without any help.
 */
async function freshEditor(page: Page, opts: { engaged?: boolean } = {}) {
  await page.addInitScript((engaged) => {
    try {
      localStorage.setItem("aqlamna-onboarding-done", "1");
      if (engaged) localStorage.setItem("aqlamna-install-engaged", "1");
    } catch {
      /* private mode */
    }
  }, opts.engaged ?? false);
  await page.goto(EDITOR, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

/** Dispatch the event Chromium would dispatch when the app is installable. */
async function fireBeforeInstallPrompt(page: Page) {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(e, {
      prompt: () => {
        (window as unknown as { __promptCalled: boolean }).__promptCalled = true;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    (window as unknown as { __defaultPrevented?: boolean }).__defaultPrevented =
      !window.dispatchEvent(e);
  });
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// Chromium
// ---------------------------------------------------------------------------

test.describe("install offer — Chromium", () => {
  test("does NOT appear before the writer has done anything", async ({ page }) => {
    await freshEditor(page, { engaged: false });
    await fireBeforeInstallPrompt(page);
    await expect(page.locator(BAR)).toHaveCount(0);
  });

  test("appears once the event fires and the writer has typed", async ({ page }) => {
    await freshEditor(page, { engaged: false });

    // Type — this is the engagement signal, not a synthetic flag.
    await page.locator(".cm-content").click();
    await page.keyboard.type("=== البداية ===");
    await page.waitForTimeout(300);

    await fireBeforeInstallPrompt(page);

    await expect(page.locator(BAR)).toHaveAttribute("data-install-prompt", "chromium");
    await expect(page.locator(CHROMIUM_BUTTON)).toBeVisible();
    await expect(page.locator(CHROMIUM_BUTTON)).toContainText("ثبّت التطبيق");

    // The browser's own mini-infobar must have been suppressed, or we would be
    // showing a second offer next to Chrome's.
    expect(
      await page.evaluate(() => (window as unknown as { __defaultPrevented: boolean }).__defaultPrevented),
    ).toBe(true);
  });

  test("clicking it calls prompt() and reports the outcome", async ({ page }) => {
    await freshEditor(page, { engaged: true });
    await fireBeforeInstallPrompt(page);

    await page.locator(CHROMIUM_BUTTON).click();
    await page.waitForTimeout(300);

    expect(
      await page.evaluate(() => (window as unknown as { __promptCalled: boolean }).__promptCalled),
    ).toBe(true);
    await expect(page.locator(BAR)).toContainText("تم تثبيت أقلامنا.");
  });

  test("is NOT shown when already running as an installed app", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("aqlamna-onboarding-done", "1");
        localStorage.setItem("aqlamna-install-engaged", "1");
        localStorage.removeItem("aqlamna-install-dismissed");
      } catch {
        /* private mode */
      }
      const real = window.matchMedia.bind(window);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).matchMedia = (q: string) =>
        q.includes("display-mode: standalone")
          ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} } as MediaQueryList)
          : real(q);
    });
    await page.goto(EDITOR, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    await fireBeforeInstallPrompt(page);
    await expect(page.locator(BAR)).toHaveCount(0);
  });

  test("dismissal is remembered across a reload", async ({ page }) => {
    await freshEditor(page, { engaged: true });
    await fireBeforeInstallPrompt(page);
    await expect(page.locator(BAR)).toBeVisible();

    await page.getByRole("button", { name: "أغلق" }).click();
    await expect(page.locator(BAR)).toHaveCount(0);

    expect(
      await page.evaluate(() => localStorage.getItem("aqlamna-install-dismissed")),
    ).toBe("1");

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await fireBeforeInstallPrompt(page);
    await expect(page.locator(BAR)).toHaveCount(0);
  });

  test("never blocks the page — the editor stays reachable behind it", async ({ page }) => {
    await freshEditor(page, { engaged: true });
    await fireBeforeInstallPrompt(page);
    await expect(page.locator(BAR)).toBeVisible();

    // No overlay: the bar is in flow, so the editor still takes typing.
    await page.locator(".cm-content").click();
    await page.keyboard.type("مرحبا");
    await expect(page.locator(".cm-content")).toContainText("مرحبا");

    const overlapping = await page.evaluate(() => {
      const bar = document.querySelector("[data-install-prompt]")!;
      const style = getComputedStyle(bar);
      return { position: style.position, zIndex: style.zIndex };
    });
    expect(overlapping.position).toBe("static");
  });
});

// ---------------------------------------------------------------------------
// iOS
// ---------------------------------------------------------------------------

test.describe("install offer — iOS", () => {
  test.use({ userAgent: IOS_SAFARI_UA, viewport: { width: 390, height: 844 } });

  test("iOS Safari gets written instructions, with no event at all", async ({ page }) => {
    await freshEditor(page, { engaged: true });

    // Note: no beforeinstallprompt is fired. Safari never sends one.
    await expect(page.locator(BAR)).toHaveAttribute("data-install-prompt", "ios");
    await expect(page.locator(IOS_BUTTON)).toBeVisible();

    await page.locator(IOS_BUTTON).click();
    const sheet = page.locator(IOS_SHEET);
    await expect(sheet).toBeVisible();

    const text = (await sheet.innerText()).replace(/\s+/g, " ").trim();
    expect(text).toBe(
      "لتثبيت أقلامنا على جهازك: ١. اضغط زر المشاركة ⬆️ ٢. اختر «إضافة إلى الشاشة الرئيسية»",
    );
  });

  test("iOS Safari in standalone shows nothing", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("aqlamna-onboarding-done", "1");
        localStorage.setItem("aqlamna-install-engaged", "1");
      } catch {
        /* private mode */
      }
      // iOS reports home-screen apps here, not via display-mode.
      Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    });
    await page.goto(EDITOR, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await expect(page.locator(BAR)).toHaveCount(0);
  });
});

test.describe("install offer — iOS, non-Safari", () => {
  test.use({ userAgent: IOS_CHROME_UA, viewport: { width: 390, height: 844 } });

  test("Chrome on iOS is shown nothing — Add to Home Screen is Safari-only", async ({
    page,
  }) => {
    await freshEditor(page, { engaged: true });
    // No beforeinstallprompt on iOS Chrome either, so nothing may render.
    await expect(page.locator(BAR)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Installability inputs
// ---------------------------------------------------------------------------

test.describe("installability", () => {
  test("the manifest is served and carries every required field", async ({ request }) => {
    const res = await request.get("/editor/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/editor/");
    expect(m.scope).toBe("/editor/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();

    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    // Every icon must actually resolve. They used to point at the site root
    // and 404, which is why Chrome never fired beforeinstallprompt.
    for (const icon of m.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status(), `${icon.src} is missing`).toBe(200);
    }
  });

  test("the service worker is registered and has a fetch handler", async ({
    page,
    request,
  }) => {
    const res = await request.get("/editor/sw.js");
    expect(res.status()).toBe(200);
    const source = await res.text();
    expect(source).toContain('addEventListener("fetch"');

    // public/ is copied verbatim and never compiled, so the browser parses
    // this file exactly as written. It used to contain TypeScript annotations
    // and threw "script evaluation failed" on every registration.
    expect(source).not.toMatch(/\bas\s+(ExtendableEvent|FetchEvent|unknown)\b/);
    expect(() => new Function(source), "sw.js is not valid JavaScript").not.toThrow();

    await page.goto(EDITOR, { waitUntil: "networkidle" });
    // Registration is asynchronous and is kicked off after first paint, so
    // networkidle is not enough — wait for the registration itself.
    const scope = await page.evaluate(async () => {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 10000)),
      ]);
      return reg?.scope ?? null;
    });
    expect(scope, "no service worker registered").not.toBeNull();
    expect(scope!.endsWith("/editor/")).toBe(true);
  });
});

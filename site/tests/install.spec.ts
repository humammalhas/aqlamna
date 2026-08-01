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

    // Type — this is the engagement signal, not a synthetic flag. The قصتك tab
    // opens on the visual writer now, so the typing that counts happens in a
    // scene's prose box rather than in CodeMirror.
    await page.getByLabel("نصّ المقطع 1").fill("أنت واقف أمام باب.");
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
    await page.getByLabel("نصّ المقطع 1").fill("مرحبا");
    await expect(page.getByLabel("نصّ المقطع 1")).toHaveValue("مرحبا");

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
// The home page — where people actually arrive
// ---------------------------------------------------------------------------

test.describe("install offer — home page", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the home page links the manifest and is inside its scope", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const href = await page.getAttribute('link[rel="manifest"]', "href");
    expect(href, "the home page linked no manifest at all").toBeTruthy();

    const manifest = await page.evaluate(async (h) => (await fetch(h!)).json(), href);
    expect(manifest.scope).toBe("/");
    // The page being offered for install MUST be inside the manifest's scope,
    // or Chrome ignores the manifest entirely and offers nothing.
    expect(new URL("/", page.url()).pathname.startsWith(manifest.scope)).toBe(true);
  });

  test("registers a service worker at the site root", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const scope = await page.evaluate(async () => {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 10000)),
      ]);
      return reg?.scope ?? null;
    });
    expect(scope, "no service worker on the home page").not.toBeNull();
    expect(new URL(scope!).pathname).toBe("/");
  });

  test("offers the install after the visitor has looked around", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    // Nothing on arrival.
    await expect(page.locator('[data-install-prompt][data-open="1"]')).toHaveCount(0);

    await fireBeforeInstallPrompt(page);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);

    const bar = page.locator('[data-install-prompt][data-open="1"]');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("ثبّت التطبيق");
  });

  test("dismissing on the home page is remembered", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await fireBeforeInstallPrompt(page);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);

    await page.getByRole("button", { name: "أغلق" }).click();
    expect(
      await page.evaluate(() => localStorage.getItem("aqlamna-install-dismissed")),
    ).toBe("1");
    await expect(page.locator('[data-install-prompt][data-open="1"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Readability
//
// The install button first shipped with `color: var(--aq-accent-text)` — the
// EDITOR's variable name. site/assets/aqlamna.css calls the same colour
// --aq-on-accent, so on the home page the variable was undefined, the text
// fell back to the inherited dark ink, and the label was near-black on the
// ink-blue button. An undefined custom property is invisible in source and in
// any test that only checks the markup; it has to be measured after render.
// ---------------------------------------------------------------------------

/** WCAG 2.1 relative-luminance contrast ratio between two rgb() strings. */
function contrastRatio(fg: string, bg: string): number {
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(parse(fg));
  const b = lum(parse(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe("install offer — readable", () => {
  test("the home page button clears WCAG AA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await fireBeforeInstallPrompt(page);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);

    const c = await page.locator("[data-install-button]").evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });

    // A colour that resolved from an undefined variable shows up here as the
    // inherited ink, not as cream.
    const ratio = contrastRatio(c.color, c.background);
    expect(
      ratio,
      `install button ${c.color} on ${c.background} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("the editor button clears WCAG AA", async ({ page }) => {
    await freshEditor(page, { engaged: true });
    await fireBeforeInstallPrompt(page);

    const c = await page.locator(CHROMIUM_BUTTON).evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });

    const ratio = contrastRatio(c.color, c.background);
    expect(
      ratio,
      `install button ${c.color} on ${c.background} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// Installability inputs
// ---------------------------------------------------------------------------

test.describe("installability", () => {
  test("the manifest is served and carries every required field", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/editor/");
    expect(m.scope).toBe("/");
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
    const res = await request.get("/sw.js");
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
    expect(new URL(scope!).pathname).toBe("/");
  });

  // -------------------------------------------------------------------------
  // The editor's أقلامنا wordmark links to "/". In the installed app there is
  // no address bar and no back button, so if "/" is not in the cache, tapping
  // it offline reaches Chrome's error page and the only way out is the phone's
  // back gesture. This asserts the landing page survives the network going
  // away — and that it is still the LIVE page while the network is there.
  // -------------------------------------------------------------------------
  test("the home page is precached and still served with no network", async ({
    page,
    context,
  }) => {
    // freshEditor, not a bare goto: the onboarding dialog covers the whole
    // editor on a first visit and swallows the click on the wordmark.
    await freshEditor(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Precaching happens in the install handler's waitUntil, which resolves
    // after `ready`. Poll the cache rather than sleeping on a guess.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            for (const name of await caches.keys()) {
              const keys = await (await caches.open(name)).keys();
              if (keys.some((r) => new URL(r.url).pathname === "/")) return true;
            }
            return false;
          }),
        { message: '"/" was never precached', timeout: 10000 },
      )
      .toBe(true);

    // Exactly one worker, at the site root, from /sw.js.
    const regs = await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).map((r) => ({
        scope: new URL(r.scope).pathname,
        script: r.active ? new URL(r.active.scriptURL).pathname : null,
      })),
    );
    expect(regs).toHaveLength(1);
    expect(regs[0]!.scope).toBe("/");
    expect(regs[0]!.script).toBe("/sw.js");

    // Old caches are cleaned on activate — one cache, at the current version.
    const cacheNames = await page.evaluate(() => caches.keys());
    expect(cacheNames).toHaveLength(1);
    expect(cacheNames[0]).toMatch(/^aqlamna-app-aqlamna-v\d+$/);

    // Nothing but the app shell got swept in. The exported story especially
    // must never be cached: it is someone's work and a stale copy corrupts it.
    const cached = await page.evaluate(async () => {
      const c = await caches.open((await caches.keys())[0]!);
      return (await c.keys()).map((r) => decodeURIComponent(new URL(r.url).pathname));
    });
    expect(cached.sort()).toEqual(
      [
        "/",
        "/assets/favicon.ico",
        "/assets/icon-192.png",
        "/assets/icon-512.png",
        "/editor/",
        "/editor/index.html",
        "/manifest.webmanifest",
      ].sort(),
    );

    // Now cut the network and go home the way the wordmark does.
    await context.setOffline(true);
    await page.click("header a[data-home-link]");
    await page.waitForLoadState("load");

    expect(page.url().startsWith("chrome-error://"), "landed on the error page").toBe(
      false,
    );
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("h1.hero-title")).toHaveText("أقلامنا");

    await context.setOffline(false);
  });
});

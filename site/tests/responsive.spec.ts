// ---------------------------------------------------------------------------
// Responsive + layout regression suite.
//
// Every assertion is a NUMBER read out of a rendered page. Run against the
// local build by default; point BASE_URL at the deployed site to check what
// actually shipped:
//
//   BASE_URL=https://aqlamna.org npx playwright test \
//     --config site/playwright.config.ts responsive.spec.ts
//
// The three breakpoints are the only three that exist:
//   phone < 40rem (640px) · tablet 40–64rem · desktop >= 64rem (1024px)
// ---------------------------------------------------------------------------

import { test, expect, type Page } from "@playwright/test";
import {
  measurePage,
  measureArrow,
  measureEditorPanes,
  BEACON,
} from "./measure-lib.mjs";

const WIDTHS = [390, 768, 1024, 1440];

const PAGES = [
  { path: "/", label: "landing" },
  { path: "/docs/" + encodeURIComponent("البداية") + ".html", label: "docs-bidaya" },
  { path: "/docs/" + encodeURIComponent("المرجع") + ".html", label: "docs-marja" },
  { path: "/docs/" + encodeURIComponent("الأخطاء") + ".html", label: "docs-akhta" },
  { path: "/privacy.html", label: "privacy" },
  { path: "/terms.html", label: "terms" },
  { path: "/editor/", label: "editor" },
  { path: "/" + encodeURIComponent("العطر_المفقود") + ".html", label: "story" },
];

/**
 * The onboarding overlay is a modal dialog that covers the editor on a first
 * visit and swallows every click. Mark it seen BEFORE the page scripts run.
 */
async function skipOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aqlamna-onboarding-done", "1");
    } catch {
      /* private mode — the overlay will show and the test will say so */
    }
  });
}

/** Collect console errors, ignoring the Cloudflare beacon we do not control. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes(BEACON)) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

// ---------------------------------------------------------------------------
// Every page, every width
// ---------------------------------------------------------------------------

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const { path, label } of PAGES) {
      test(`${label} — no horizontal scroll, nothing off-screen, no console errors`, async ({
        page,
      }) => {
        const errors = watchConsole(page);
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(400);

        const m = await measurePage(page);

        // document.scrollWidth === window.innerWidth
        expect(
          m.documentScrollWidth,
          `${label} @${width}: document scrolls sideways`,
        ).toBe(m.viewportWidth);

        // Every interactive element: x >= 0 and x + width <= viewport width.
        // This is what caught ▶ شغّل at x = -113.
        expect(
          m.overflowing,
          `${label} @${width}: interactive elements outside the viewport`,
        ).toEqual([]);

        expect(errors, `${label} @${width}: console errors`).toEqual([]);

        // One document, one top-level heading.
        expect(m.h1Count, `${label} @${width}: h1 count`).toBe(1);

        // Icon-only buttons must still have an accessible name.
        expect(
          m.unlabelledControls,
          `${label} @${width}: buttons with no text, aria-label or title`,
        ).toEqual([]);

        if (width < 640) {
          // Controls must be tappable. Links inside a sentence are excluded —
          // a 44px inline link would wreck the paragraph it sits in.
          expect(
            m.smallestControlTarget!.min,
            `${label} @390: smallest control is ${m.smallestControlTarget!.tag} "${m.smallestControlTarget!.text}"`,
          ).toBeGreaterThanOrEqual(44);
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// A2 — operator runs render left-to-right
// ---------------------------------------------------------------------------

test.describe("bidi: ASCII operator runs", () => {
  for (const { path, label } of PAGES.filter((p) => p.label.startsWith("docs") || p.label === "landing")) {
    test(`${label}: the dash of -> is painted LEFT of the >`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      const arrow = await measureArrow(page);
      expect(arrow, `${label}: no -> found in any <pre>`).not.toBeNull();
      expect(
        arrow!.dashX,
        `${label}: dashX=${arrow!.dashX} gtX=${arrow!.gtX}`,
      ).toBeLessThan(arrow!.gtX);
    });
  }
});

// ---------------------------------------------------------------------------
// A1 + A4 — the exported story
// ---------------------------------------------------------------------------

test.describe("exported story", () => {
  const STORY = "/" + encodeURIComponent("العطر_المفقود") + ".html";

  test("prose is split into paragraphs, not welded into one", async ({ page }) => {
    await page.goto(STORY, { waitUntil: "networkidle" });
    const m = await measurePage(page);

    expect(m.paragraphCount, "p.aq-text count").toBeGreaterThan(1);

    // Per paragraph. Concatenating them back together recreates the weld and
    // proves nothing — the bug was two sentences inside ONE <p>.
    for (const p of m.paragraphTexts) {
      expect(p, "welded sentences inside one paragraph").not.toMatch(
        /[.؟!]"?[ء-ي]/,
      );
    }
    expect(m.paragraphTexts[0]).toMatch(/لا شيء عليها\.$/);
    expect(m.paragraphTexts[1]).toMatch(/^"وصفة جدّتي ضاعت،/);
  });

  test("html and body carry the page background", async ({ page }) => {
    await page.goto(STORY, { waitUntil: "networkidle" });
    const m = await measurePage(page);
    // Cream, the default light theme: #F6F1E7.
    expect(m.bodyBackground).toBe("rgb(246, 241, 231)");
    expect(m.htmlBackground).toBe("rgb(246, 241, 231)");
  });

  test("choice buttons are at least 48px tall on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(STORY, { waitUntil: "networkidle" });
    const heights = await page
      .locator(".aq-choice-btn")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);
  });
});

// ---------------------------------------------------------------------------
// A3 / A6 / B1–B3 — the editor
// ---------------------------------------------------------------------------

test.describe("editor layout", () => {
  test("phone: one pane, full width, with a bottom tab bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const m = await measureEditorPanes(page);
    expect(m.paneCount).toBe(1);
    expect(m.panes[0]!.x).toBe(0);
    expect(m.panes[0]!.width).toBe(390);
    expect(m.panes[0]!.hasContent).toBe(true);

    // Three tabs, each at least 48px tall, none off-screen.
    expect(m.tabBar).toHaveLength(3);
    for (const tab of m.tabBar) {
      expect(tab.height).toBeGreaterThanOrEqual(48);
      expect(tab.x).toBeGreaterThanOrEqual(0);
      expect(tab.x + tab.width).toBeLessThanOrEqual(390.5);
    }
    // Exactly one tab is pressed, and it is the pane that is rendered.
    const pressed = m.tabBar.filter((t) => t.pressed === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.name).toBe(m.panes[0]!.name);
  });

  test("tablet: at most two panes, and a third selection replaces one", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    let m = await measureEditorPanes(page);
    expect(m.paneCount).toBeLessThanOrEqual(2);

    await page.getByRole("button", { name: "مخطط", exact: true }).click();
    await page.waitForTimeout(300);

    m = await measureEditorPanes(page);
    expect(m.paneCount, "a third pane was added instead of replacing one").toBe(2);
  });

  for (const width of [1024, 1440]) {
    test(`desktop ${width}: columns sum to the viewport and no pane is 0px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      // Turn every pane on, one at a time — the bug was that a pane enabled
      // after a manual drag got a column of exactly 0px.
      for (const name of ["شغّل", "قصتك", "مخطط"]) {
        const btn = page.getByRole("button", { name, exact: true });
        if ((await btn.getAttribute("aria-pressed")) === "false") {
          await btn.click();
          await page.waitForTimeout(250);
        }
      }

      const m = await measureEditorPanes(page);
      expect(m.paneCount).toBe(3);

      const cols = m.gridTemplateColumns!.split(" ").map(parseFloat);
      const sum = cols.reduce((a, b) => a + b, 0);
      expect(sum, `columns "${m.gridTemplateColumns}" sum to ${sum}`).toBeCloseTo(
        width,
        0,
      );

      for (const pane of m.panes) {
        expect(pane.width, `pane ${pane.name} is ${pane.width}px wide`).toBeGreaterThan(0);
        expect(pane.height, `pane ${pane.name} is ${pane.height}px tall`).toBeGreaterThan(0);
        expect(pane.hasContent, `pane ${pane.name} is an empty box`).toBe(true);
        // Every pane is positioned the same way, or the positioned one paints
        // over its neighbour regardless of DOM order.
        expect(pane.position).toBe("relative");
      }

      // Panes are laid out side by side and never overlap.
      const sorted = [...m.panes].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1]!.x + sorted[i - 1]!.width).toBeLessThanOrEqual(
          sorted[i]!.x + 0.5,
        );
      }
    });
  }

  test("dividers follow the cursor instead of running away from it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const divider = page.locator('[role="separator"]').first();
    await expect(divider).toBeVisible();

    const box = (await divider.boundingBox())!;
    const startX = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + 100, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const endX = (await divider.boundingBox())!.x + box.width / 2;
    const moved = endX - startX;

    // It used to move -100 for +100: exactly inverted, because the handler
    // added a raw screen delta to the width of the pane on the RIGHT.
    expect(moved, `cursor moved +100, divider moved ${moved.toFixed(1)}`).toBeGreaterThan(50);
  });

  test("the editor never lets every pane be switched off", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    for (const name of ["شغّل", "قصتك", "مخطط"]) {
      const btn = page.getByRole("button", { name, exact: true });
      if ((await btn.getAttribute("aria-pressed")) === "true") {
        await btn.click();
        await page.waitForTimeout(200);
      }
    }

    const m = await measureEditorPanes(page);
    expect(m.paneCount, "every pane switched off").toBeGreaterThanOrEqual(1);

    // The toggle that is still ON must be the pane that is rendered.
    const on: string[] = [];
    for (const [name, key] of [
      ["شغّل", "player"],
      ["قصتك", "text"],
      ["مخطط", "canvas"],
    ] as const) {
      const btn = page.getByRole("button", { name, exact: true });
      if ((await btn.getAttribute("aria-pressed")) === "true") on.push(key);
    }
    expect(on.sort()).toEqual(m.panes.map((p) => p.name).sort());
  });

  test("phone portrait: the run button is visible in the top bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // A tab is not a button. "run" has to be a control you can SEE, in the
    // same place it appears when the phone is rotated past 640px — and
    // الإعدادات stays visible beside it rather than being buried in ☰.
    const run = page.locator("header [data-run-button]");
    await expect(run).toBeVisible();
    await expect(run).toContainText("شغّل");

    const settings = page.getByRole("button", { name: "الإعدادات" });
    await expect(settings).toBeVisible();
    const sBox = (await settings.boundingBox())!;
    expect(sBox.x).toBeGreaterThanOrEqual(0);
    expect(sBox.x + sBox.width).toBeLessThanOrEqual(390.5);

    // Both in the bar and the bar still does not scroll sideways.
    const header = await page.locator("header").evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(header.scrollWidth).toBe(header.clientWidth);

    const box = (await run.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390.5);
    expect(box.height).toBeGreaterThanOrEqual(44);

    // And it must look like the primary action, not like plain text.
    const bg = await run.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("phone: you can actually run a story", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // The yellow ▶ شغّل lives in the desktop top bar, which has no room on a
    // phone. If the شغّل TAB only switches panes and never compiles, the
    // player sits on its empty state forever and a phone can write but never
    // run — which is the whole complaint the responsive work started from.
    await page.locator(".cm-content").click();
    // Line by line with a delay. Typing a whole multi-line story in one burst
    // drops keystrokes in CodeMirror and silently merges lines — a source that
    // then compiles to something else entirely, which makes the test lie in
    // both directions.
    const story = [
      "=== البداية ===",
      "الشمس عالية والطريق طويل.",
      "",
      "* [امضِ] -> النهاية",
      "",
      "=== النهاية ===",
      "وصلتَ.",
    ];
    for (let i = 0; i < story.length; i++) {
      if (story[i]) await page.keyboard.type(story[i]!, { delay: 20 });
      if (i < story.length - 1) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(100);
      }
    }
    await page.waitForTimeout(400);

    // Guard the guard: if the lines merged, everything below is meaningless.
    const lines = await page.$$eval(".cm-line", (els) => els.map((e) => e.textContent));
    expect(lines, "typed source was mangled").toEqual(story);

    // Use the top-bar run button, which is what a person reaches for.
    await page.locator("header [data-run-button]").click();
    await page.waitForTimeout(600);

    const player = page.locator('[data-pane="player"]');
    await expect(player).toBeVisible();
    await expect(player).not.toContainText("اضغط ▶ شغّل لتشغيل القصة");
    await expect(player).toContainText("الشمس عالية");
    // The story is playable, not just printed.
    await expect(player.locator(".aq-choice-btn")).toHaveCount(1);
  });

  // A menu that opens behind a clipping ancestor is indistinguishable from a
  // dead button. Both of these were broken by an `overflow: hidden` on the
  // header and no test noticed, because no test had ever opened a menu.
  test("phone: the ☰ menu actually opens, fully visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "القائمة" }).click();
    await page.waitForTimeout(300);

    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();

    const box = (await menu.boundingBox())!;
    expect(box.height, "menu has no height").toBeGreaterThan(100);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390.5);

    // Nothing may clip it: every item must be on screen and hit-testable.
    for (const label of ["⬇ تصدير", "قصة جديدة", "افتح مثالًا"]) {
      const item = page.getByRole("menuitem", { name: label });
      await expect(item).toBeVisible();
      const r = (await item.boundingBox())!;
      expect(r.y + r.height, `${label} is painted below the fold`).toBeLessThanOrEqual(844);
    }
    // The documentation links live here on a phone too.
    await expect(menu.locator("a")).toHaveCount(3);
  });

  for (const width of [768, 1440]) {
    test(`${width}: the ❓ menu opens and its doc links are reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await skipOnboarding(page);
      await page.goto("/editor/", { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: "مساعدة" }).click();
      await page.waitForTimeout(300);

      // The THREE DOC LINKS, not "every anchor in the header". The header now
      // also carries the أقلامنا wordmark as a link to "/", which is a
      // permanent fourth <a> and has nothing to do with this menu. The doc
      // links are the ones that open in a new tab.
      const links = page.locator('header a[target="_blank"]');
      await expect(links).toHaveCount(3);

      const headerBottom = await page
        .locator("header")
        .evaluate((el) => el.getBoundingClientRect().bottom);

      for (let i = 0; i < 3; i++) {
        const link = links.nth(i);
        await expect(link).toBeVisible();
        const r = (await link.boundingBox())!;
        // The bug: links sat below the header, which clipped them away.
        expect(r.y).toBeGreaterThanOrEqual(headerBottom - 1);
        expect(r.height).toBeGreaterThan(0);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(width + 0.5);
      }
    });
  }

  test("CodeMirror wraps long lines instead of scrolling sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // Make sure the text pane is on.
    const textBtn = page.getByRole("button", { name: "قصتك", exact: true });
    if ((await textBtn.getAttribute("aria-pressed")) === "false") {
      await textBtn.click();
      await page.waitForTimeout(300);
    }

    await page.locator(".cm-content").click();
    await page.keyboard.type(
      "=== البداية === ARABIC_MASTERY.md وهذا سطر طويل جدًّا يتجاوز عرض العمود بكثير حتى يضطر المحرّر إلى لفّه على أكثر من سطر واحد",
    );
    await page.waitForTimeout(400);

    const m = await measureEditorPanes(page);
    expect(m.codeMirror).not.toBeNull();
    expect(
      m.codeMirror!.scrollWidth,
      `scroller ${m.codeMirror!.clientWidth} client / ${m.codeMirror!.scrollWidth} scroll`,
    ).toBe(m.codeMirror!.clientWidth);
    expect(m.codeMirror!.widestLine).toBeLessThanOrEqual(m.codeMirror!.clientWidth);
  });
});

// ---------------------------------------------------------------------------
// The way out of the editor
//
// Measured before this existed: 0 <a> in the editor header, 0 links to "/"
// anywhere on the page, and أقلامنا in the corner was a <span>. Browser back
// and retyping the URL were the only exits — and an INSTALLED user has
// neither, because the manifest opens the app at /editor/ in `standalone`
// with no address bar.
// ---------------------------------------------------------------------------

test.describe("the editor has a way back to the site", () => {
  for (const width of [390, 1440]) {
    test(`${width}: the wordmark is a real link to / and lands on the landing page`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await skipOnboarding(page);
      await page.goto("/editor/", { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      const link = page.locator("header a[data-home-link]");
      await expect(link).toBeVisible();

      const attrs = await link.evaluate((el: HTMLAnchorElement) => ({
        tag: el.tagName.toLowerCase(),
        hrefAttr: el.getAttribute("href"),
        // A resolved href is what middle-click, ⌘/Ctrl-click and "open in new
        // tab" actually use. A click handler on a <span> gives none of them.
        resolvedPath: new URL(el.href).pathname,
        target: el.getAttribute("target"),
        accessibleName: el.getAttribute("aria-label") ?? "",
        visibleText: el.textContent!.trim(),
        textDecorationLine: getComputedStyle(el).textDecorationLine,
      }));

      expect(attrs.tag, "the wordmark is not an anchor").toBe("a");
      expect(attrs.hrefAttr).toBe("/");
      expect(attrs.resolvedPath).toBe("/");
      // target="_blank" inside an installed app throws the writer out into a
      // browser window. The whole point is to stay in the app.
      expect(attrs.target).toBeNull();
      // WCAG 2.5.3: the accessible name must contain the visible label, and it
      // must say where the link GOES — "أقلامنا" alone is a brand name.
      expect(attrs.accessibleName).toContain(attrs.visibleText);
      expect(attrs.accessibleName.length).toBeGreaterThan(attrs.visibleText.length);
      // An anchor underlines by default; the span it replaced did not.
      expect(attrs.textDecorationLine).toBe("none");

      // Keyboard: reachable, with a visible ring. Assert the COMPUTED outline
      // off the focused element, not the presence of a :focus-visible rule.
      await link.focus();
      const ring = await link.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          isActive: document.activeElement === el,
          outlineStyle: cs.outlineStyle,
          outlineWidth: parseFloat(cs.outlineWidth),
        };
      });
      expect(ring.isActive).toBe(true);
      expect(ring.outlineStyle).not.toBe("none");
      expect(ring.outlineWidth).toBeGreaterThan(0);

      // Clicking it actually arrives somewhere, in this window.
      const response = await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle" }),
        link.click(),
      ]);
      expect(response[0]!.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(page.locator("h1.hero-title")).toHaveText("أقلامنا");
      expect(page.context().pages()).toHaveLength(1);
    });
  }

  test("390: the link costs the top bar nothing — no scroll, nothing off-screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const header = await page.locator("header").evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(
      header.scrollWidth,
      `header ${header.scrollWidth} scroll / ${header.clientWidth} client`,
    ).toBe(header.clientWidth);

    // Every control in the bar, wordmark included: on screen and big enough to
    // hit. ⬇ تصدير and ▶ شغّل once sat at NEGATIVE x here.
    const boxes = await page
      .locator("header a, header button")
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.getAttribute("aria-label") ?? el.textContent!.trim(),
            x: r.x,
            width: r.width,
            height: r.height,
          };
        }),
      );
    expect(boxes.length).toBe(5); // أقلامنا · ⚙️ · ▶ شغّل · ⬇ تصدير · ☰
    for (const b of boxes) {
      expect(b.x, `${b.name} starts at x=${b.x}`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${b.name} ends at ${b.x + b.width}`).toBeLessThanOrEqual(390.5);
      expect(b.height, `${b.name} is ${b.height}px tall`).toBeGreaterThanOrEqual(44);
      expect(b.width, `${b.name} is ${b.width}px wide`).toBeGreaterThanOrEqual(44);
    }
  });

  test("leaving mid-sentence keeps the writing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await skipOnboarding(page);
    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    // A one-click exit from an editor is only safe if the editor has already
    // written what is on screen. `setSource()` persists to IndexedDB on every
    // change, so this asserts the bytes came back — not that the code looks
    // like it saves.
    const sentence = "كان يا ما كان، في قريةٍ صغيرة على حافّة الوادي";
    await page.locator(".cm-content").click();
    await page.keyboard.type(sentence, { delay: 30 });

    // No pause between the last keystroke and the click. That is the case.
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.locator("header a[data-home-link]").click(),
    ]);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goto("/editor/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const restored = await page.evaluate(
      () =>
        new Promise<string | null>((resolve) => {
          const req = indexedDB.open("aqlamna-editor", 3);
          req.onsuccess = () => {
            const g = req.result
              .transaction("projects", "readonly")
              .objectStore("projects")
              .get("current-source");
            g.onsuccess = () => resolve((g.result as string) ?? null);
            g.onerror = () => resolve(null);
          };
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        }),
    );
    expect(restored, `typed ${sentence.length} chars, got back ${restored?.length ?? 0}`).toBe(
      sentence,
    );
    await expect(page.locator(".cm-content")).toContainText(sentence);
  });
});

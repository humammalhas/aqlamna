// ---------------------------------------------------------------------------
// The bookmark button and its confirmation, measured in a real browser.
//
// Everything here is read off the RENDERED element — geometry from
// getBoundingClientRect, colour from getComputedStyle. Nothing is inferred from
// a declaration. Two rules on this project earned that:
//
//   "Test pixels, not properties." An undefined custom property is silent, and
//   a label rendered at 1.29:1 passed every test that read markup.
//
//   The confirmation used to render below the fold. A message positioned where
//   nobody looks is the bug being fixed, so the test has to look at where it
//   actually landed, not at the fact that it exists.
//
// The page under test is the EXPORTED story, opened from file:// — the artifact
// a reader downloads, not the source it was built from.
// ---------------------------------------------------------------------------

import { test, expect, type Page } from "@playwright/test";

// No node builtins here on purpose. This package has no @types/node and its
// tsconfig pins `types: ["vite/client"]`, so `import "node:path"` fails
// `npm run typecheck` — which runs before any test in `npm test`. `new URL`
// against import.meta.url does the same job and percent-encodes the Arabic
// filename on the way.
//   tests/ → packages/editor/ → packages/ → repo root
const STORY_URL = new URL(
  "../../../stories/العطر_المفقود.html",
  import.meta.url,
).href;

const MARK_SET = "ضع علامة";
const MARK_RETURN = "ارجع إلى العلامة";

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

/** Labels of every button inside .aq-toolbar. */
async function toolbarLabels(page: Page): Promise<string[]> {
  return page.$$eval(".aq-toolbar button", (bs) =>
    bs.map((b) => (b.textContent ?? "").trim()),
  );
}

test.describe("exported story — the toolbar has two buttons", () => {
  test("two buttons, and neither is a floppy disk or a folder", async ({ page }) => {
    await page.goto(STORY_URL);

    const labels = await toolbarLabels(page);
    expect(labels, `toolbar labels: ${JSON.stringify(labels)}`).toHaveLength(2);
    expect(labels.some((l) => l.includes(MARK_SET))).toBe(true);
    expect(labels.some((l) => l.includes("أعد"))).toBe(true);

    // The pair this replaced, and the icons that came with them.
    const joined = labels.join(" ");
    expect(joined).not.toContain("حفظ");
    expect(joined).not.toContain("استعادة");
    expect(joined).not.toContain("💾");
    expect(joined).not.toContain("📂");
  });

  test("the ribbon renders as a glyph, not as tofu", async ({ page }) => {
    await page.goto(STORY_URL);

    // A missing emoji font paints U+FFFD or a .notdef box. Measuring the
    // button with and without the icon is the only way to tell from here: if
    // the ribbon draws nothing at all the two widths match.
    const widths = await page.evaluate((markSet) => {
      const btn = document.querySelector<HTMLElement>(".aq-mark-btn")!;
      const withIcon = btn.getBoundingClientRect().width;
      const label = btn.textContent ?? "";
      btn.textContent = markSet;
      const withoutIcon = btn.getBoundingClientRect().width;
      btn.textContent = label;
      return { withIcon, withoutIcon };
    }, MARK_SET);

    expect(
      widths.withIcon,
      `🔖 must occupy width: with=${widths.withIcon} without=${widths.withoutIcon}`,
    ).toBeGreaterThan(widths.withoutIcon + 8);
  });
});

test.describe("exported story — the confirmation lands where the eye is", () => {
  test("beside the button on the same row, inside the viewport, AA contrast", async ({
    page,
  }) => {
    await page.goto(STORY_URL);
    await page.locator(".aq-toolbar").scrollIntoViewIfNeeded();
    await page.click(".aq-mark-btn");

    const m = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(".aq-toolbar")!;
      const btn = document.querySelector<HTMLElement>(".aq-mark-btn")!;
      const fb = document.querySelector<HTMLElement>(".aq-feedback");
      if (!fb) return null;

      // The nearest ancestor that actually paints — a transparent span
      // inherits whatever is behind it, and that is what the reader sees.
      let node: HTMLElement | null = fb;
      let bg = "rgba(0, 0, 0, 0)";
      while (node) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
          bg = c;
          break;
        }
        node = node.parentElement;
      }

      return {
        text: fb.textContent ?? "",
        fb: fb.getBoundingClientRect().toJSON(),
        btn: btn.getBoundingClientRect().toJSON(),
        bar: bar.getBoundingClientRect().toJSON(),
        viewport: document.documentElement.clientHeight,
        colour: getComputedStyle(fb).color,
        background: bg,
        isChildOfToolbar: fb.parentElement === bar,
      };
    });

    expect(m, "no .aq-feedback rendered after pressing the mark button").not.toBeNull();
    const r = m!;

    expect(r.text).toBe("وضعنا العلامة");
    expect(r.isChildOfToolbar).toBe(true);

    // Same row as the button: the vertical bands overlap. A message on its own
    // line beneath the buttons fails here, which is the whole point.
    expect(
      r.fb.top,
      `feedback top ${r.fb.top} vs button bottom ${r.btn.bottom}`,
    ).toBeLessThan(r.btn.bottom);
    expect(r.fb.bottom).toBeGreaterThan(r.btn.top);

    // Inside the toolbar's own box, and inside the viewport.
    expect(r.fb.bottom).toBeLessThanOrEqual(r.bar.bottom + 1);
    expect(
      r.fb.bottom,
      `feedback bottom ${r.fb.bottom} vs viewport ${r.viewport}`,
    ).toBeLessThanOrEqual(r.viewport);

    const ratio = contrastRatio(r.colour, r.background);
    expect(
      ratio,
      `feedback ${r.colour} on ${r.background} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("it stays up longer than the 2000ms that was too short", async ({ page }) => {
    await page.goto(STORY_URL);
    await page.locator(".aq-toolbar").scrollIntoViewIfNeeded();
    await page.click(".aq-mark-btn");

    await page.waitForTimeout(2400);
    await expect(
      page.locator(".aq-feedback"),
      "gone at 2400ms — the old 2000ms hold is still in place",
    ).toHaveCount(1);

    await page.waitForTimeout(1600);
    await expect(page.locator(".aq-feedback")).toHaveCount(0);
  });

  test("أعد shows a message — it used to restart in silence", async ({ page }) => {
    await page.goto(STORY_URL);
    const opening = await page.locator(".aq-output").innerText();

    await page.locator(".aq-choice-btn").first().click();
    expect(await page.locator(".aq-output").innerText()).not.toBe(opening);

    await page.locator(".aq-toolbar").scrollIntoViewIfNeeded();
    await page.click(".aq-restart-btn");

    await expect(page.locator(".aq-feedback")).toHaveText("بدأنا القصة من جديد");
    expect(await page.locator(".aq-output").innerText()).toBe(opening);
  });
});

test.describe("exported story — the bookmark round trip", () => {
  test("mark, read on, return; the mark is spent and the label flips back", async ({
    page,
  }) => {
    await page.goto(STORY_URL);
    const opening = await page.locator(".aq-output").innerText();

    await page.locator(".aq-toolbar").scrollIntoViewIfNeeded();
    await page.click(".aq-mark-btn");
    await expect(page.locator(".aq-mark-btn")).toContainText(MARK_RETURN);

    const stored = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("aqlamna_save_")),
    );
    expect(stored, `localStorage keys: ${JSON.stringify(stored)}`).toHaveLength(1);

    await page.locator(".aq-choice-btn").first().click();
    expect(await page.locator(".aq-output").innerText()).not.toBe(opening);
    await expect(page.locator(".aq-mark-btn")).toContainText(MARK_RETURN);

    await page.locator(".aq-toolbar").scrollIntoViewIfNeeded();
    await page.click(".aq-mark-btn");

    expect(await page.locator(".aq-output").innerText()).toBe(opening);
    await expect(page.locator(".aq-feedback")).toHaveText("رجعنا إلى العلامة");
    await expect(page.locator(".aq-mark-btn")).toContainText(MARK_SET);

    // Returning spends the mark.
    const after = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("aqlamna_save_")),
    );
    expect(after).toHaveLength(0);
  });

  test("a save left by the old حفظ button opens as a bookmark", async ({ page }) => {
    await page.goto(STORY_URL);

    // Same key, same payload as before this change — nobody's position is
    // orphaned by the new labels.
    await page.evaluate(() => {
      const title = document.title;
      localStorage.setItem(
        "aqlamna_save_" + title.replace(/[^a-zA-Z؀-ۿ0-9_-]/g, "_"),
        JSON.stringify({
          save_version: 2,
          passage: "الجرار",
          variables: {},
          lists: {},
          visited: {},
          consumed: {},
          ended: false,
        }),
      );
    });
    await page.reload();

    await expect(page.locator(".aq-mark-btn")).toContainText(MARK_RETURN);
  });
});

test.describe("exported story — offline and phone-sized", () => {
  test("zero network requests from file://", async ({ page }) => {
    const offsite: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("file://")) offsite.push(r.url());
    });

    await page.goto(STORY_URL, { waitUntil: "networkidle" });
    await page.locator(".aq-toolbar").scrollIntoViewIfNeeded();
    await page.click(".aq-mark-btn");

    expect(offsite, `off-file requests: ${JSON.stringify(offsite)}`).toHaveLength(0);
  });

  test("at 390px the toolbar row does not overflow its container", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(STORY_URL);
    await page.locator(".aq-toolbar").scrollIntoViewIfNeeded();
    await page.click(".aq-mark-btn");

    const m = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(".aq-toolbar")!;
      const story = document.querySelector<HTMLElement>(".aq-story")!;
      const items = [...bar.children].map((c) => {
        const r = c.getBoundingClientRect();
        return { cls: c.className, x: r.x, width: r.width, top: r.top, bottom: r.bottom };
      });
      return {
        items,
        barWidth: bar.getBoundingClientRect().width,
        scrollWidth: story.scrollWidth,
        clientWidth: story.clientWidth,
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
      };
    });

    // Nothing may push the page sideways — the phone sweep rule.
    expect(m.docScroll, JSON.stringify(m, null, 1)).toBeLessThanOrEqual(m.docClient);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);

    // Every item is inside the toolbar's width, at a non-negative x.
    for (const it of m.items) {
      expect(it.x, `${it.cls} at x=${it.x}`).toBeGreaterThanOrEqual(0);
      expect(it.width, `${it.cls} width ${it.width}`).toBeGreaterThan(0);
    }
  });
});

test.describe("editor player pane — the toolbar's other home", () => {
  // The toolbar renders in two places: the exported standalone HTML and the
  // editor's ▶ شغّل pane. They must change together, so the pane gets the same
  // measurements the export got.
  test("two buttons, the same labels, and the confirmation on the same row", async ({
    page,
  }) => {
    // The onboarding overlay covers the top bar on a fresh profile, so the
    // run button is there but unclickable. Mark it seen before first paint.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("aqlamna-onboarding-done", "1");
      // This test drives CodeMirror's "افتح مثالًا" and counts `.cm-line`, so
      // it opts into the advanced mode the قصتك tab no longer defaults to.
      localStorage.setItem("aqlamna-writer-mode", "code");
    });
    await page.reload();
    await page.waitForSelector(".cm-line", { timeout: 15000 });

    // A fresh profile opens on an empty document, and compileSource() returns
    // early on empty source — ▶ شغّل would do nothing at all. Load the seed
    // story first, the same way a new author does.
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "افتح مثالًا" }).first().click();
    await page.waitForFunction(
      () => (document.querySelectorAll(".cm-line").length ?? 0) > 5,
      undefined,
      { timeout: 15000 },
    );

    // The player PANE TOGGLE is also called "شغّل", so the run ACTION carries
    // an explicit aria-label to keep the two nameable apart — see TopBar.tsx.
    await page.getByRole("button", { name: "شغّل القصة" }).click();
    await page.waitForSelector(".player-pane .aq-toolbar", { timeout: 15000 });

    const labels = await page.$$eval(".player-pane .aq-toolbar button", (bs) =>
      bs.map((b) => (b.textContent ?? "").trim()),
    );
    // The pane also carries the 🎨 theme toggle, which the export does not.
    expect(labels, JSON.stringify(labels)).toContain("🔖 " + MARK_SET);
    expect(labels.filter((l) => /حفظ|استعادة|💾|📂/.test(l))).toHaveLength(0);

    await page.locator(".player-pane .aq-mark-btn").scrollIntoViewIfNeeded();
    await page.click(".player-pane .aq-mark-btn");
    await expect(page.locator(".player-pane .aq-mark-btn")).toContainText(MARK_RETURN);

    const m = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>(".player-pane")!;
      const btn = document.querySelector<HTMLElement>(".player-pane .aq-mark-btn")!;
      const fb = document.querySelector<HTMLElement>(".player-pane .aq-feedback")!;
      const p = pane.getBoundingClientRect();
      const f = fb.getBoundingClientRect();
      return {
        text: fb.textContent ?? "",
        sameRow: f.top < btn.getBoundingClientRect().bottom &&
          f.bottom > btn.getBoundingClientRect().top,
        // The pane scrolls, so "visible" means inside the pane's own box.
        withinPane: f.bottom <= p.bottom + 1,
        paneClientHeight: pane.clientHeight,
      };
    });

    expect(m.text).toBe("وضعنا العلامة");
    expect(m.sameRow, "confirmation is not on the button's row").toBe(true);
    expect(m.withinPane, `pane clientHeight ${m.paneClientHeight}`).toBe(true);
  });
});

test.describe("embedded story — no toolbar at all", () => {
  /**
   * Put the exported story inside a 520px frame — the landing page's demo box.
   *
   * The host page is the story itself, because a file:// iframe will not load
   * inside an about:blank document and writing a scratch host file would mean
   * importing node:fs. What is under test is the CHILD, and every assertion
   * below is scoped to it.
   */
  async function openFramed(page: Page) {
    await page.goto(STORY_URL);
    await page.evaluate((src) => {
      const f = document.createElement("iframe");
      f.src = src;
      f.style.cssText = "inline-size:100%;block-size:520px;border:0";
      document.body.appendChild(f);
    }, STORY_URL);

    await page.waitForFunction(() => window.frames.length > 0);
    const child = page.frames().find((f) => f !== page.mainFrame());
    if (!child) throw new Error("the iframe never attached");
    await child.waitForSelector(".aq-output");
    return child;
  }

  test("zero buttons in the frame, and the story itself still renders", async ({
    page,
  }) => {
    const child = await openFramed(page);

    expect(await child.locator(".aq-output").count()).toBe(1);
    expect(await child.locator(".aq-toolbar").count()).toBe(0);
    expect(await child.locator(".aq-toolbar button").count()).toBe(0);

    // The story is still readable — only the chrome went.
    expect(await child.locator(".aq-choice-btn").count()).toBeGreaterThan(0);

    // And the top-level copy on the same page still has its toolbar, which is
    // what proves the condition is "am I framed", not "is this build stripped".
    // page.locator only ever searches the main frame, so this is the host copy.
    expect(await page.locator("#qalam-player .aq-toolbar").count()).toBe(1);
  });

  test("dropping the toolbar takes real height out of the frame", async ({ page }) => {
    const child = await openFramed(page);

    // Chromium gives every file:// document its own opaque origin, so the
    // parent cannot reach `iframe.contentDocument` — it reads as null. Measure
    // from inside the frame instead.
    const m = await child.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewport: document.documentElement.clientHeight,
      toolbars: document.querySelectorAll(".aq-toolbar").length,
      buttons: document.querySelectorAll(".aq-toolbar button").length,
    }));

    expect(m.toolbars).toBe(0);
    expect(m.buttons).toBe(0);
    // Reported, not asserted as a threshold: the story is longer than the box
    // by design and scrolls. What matters is that no chrome is added to it.
    console.log(
      `  frame: content ${m.scrollHeight}px in a ${m.viewport}px box, ` +
        `${m.toolbars} toolbars, ${m.buttons} buttons`,
    );
  });
});

import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Walk up from the working directory to the repo root. This suite is launched
 * from the repo root by `npm test` and from site/ by the Playwright webServer,
 * and these specs are loaded as CommonJS, so neither a fixed relative path nor
 * `import.meta.url` works.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "stories", "العطر_المفقود.qalam"))) return dir;
    dir = resolve(dir, "..");
  }
  throw new Error(`could not find the repo root from ${process.cwd()}`);
}

/** Passages in the demo story, counted from the .qalam the map is built from. */
function storyPassageCount(): number {
  const src = readFileSync(resolve(repoRoot(), "stories", "العطر_المفقود.qalam"), "utf-8");
  return (src.match(/^===\s+.+\s+===/gm) ?? []).length;
}

test.describe("Landing page", () => {
  test("returns 200, lang=ar, dir=rtl, contains أقلامنا", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);

    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");

    await expect(page.locator("body")).toContainText("أقلامنا");
  });

  test("the demo story is deferred behind شغّل and its URL resolves 200", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const iframe = page.locator("iframe");
    await expect(iframe).toHaveAttribute("title");

    // Not `src`. The story is a separate 58KB document and nobody who never
    // opens شغّل should pay for it, so the URL waits in `data-src` until the
    // tab is activated. If this ever becomes a plain `src` again, the page has
    // gone back to downloading the story for every visitor.
    expect(await iframe.getAttribute("src")).toBeNull();
    const src = await iframe.getAttribute("data-src");
    expect(src).toBeTruthy();

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

// ---------------------------------------------------------------------------
// The preview box. Three tabs, the editor's own three words in the editor's own
// order, on a hand-written static page.
// ---------------------------------------------------------------------------

const TABS = ["قصتك", "شغّل", "مخطط"] as const;

test.describe("Preview tabs", () => {
  test("three tabs, the editor's words in the editor's order, قصتك first", async ({ page }) => {
    await page.goto("/");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs).toHaveText([...TABS]);

    // قصتك is the default: it is what makes Aqlamna different from Twine, and
    // the editor also opens on the text pane.
    await expect(page.getByRole("tab", { name: "قصتك", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tablist")).toHaveAttribute("aria-label", "الأقسام");
  });

  for (const width of [390, 768, 1024, 1440]) {
    test(`at ${width}: each tab selects itself, shows its panel, hides the others`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/", { waitUntil: "networkidle" });

      for (const label of TABS) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        await page.waitForTimeout(150);

        const state = await page.evaluate(() => {
          const tabs = [...document.querySelectorAll('[role="tab"]')];
          const panels = [...document.querySelectorAll('[role="tabpanel"]')];
          const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
          const visible = panels.filter((p) => !(p as HTMLElement).hidden);
          return {
            selected: selected.map((t) => t.textContent!.trim()),
            visible: visible.map((p) => p.id),
            controlledBySelected: selected[0]?.getAttribute("aria-controls"),
            visibleHeight: Math.round(visible[0]?.getBoundingClientRect().height ?? 0),
            docScrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            // roving tabindex: only the selected tab is in the tab order
            tabIndexes: tabs.map((t) => (t as HTMLElement).tabIndex),
          };
        });

        expect(state.selected, `clicked ${label}`).toEqual([label]);
        expect(state.visible).toHaveLength(1);
        expect(state.visible[0]).toBe(state.controlledBySelected);
        // A panel can be "shown" and be an empty box — the pane bug, again.
        expect(state.visibleHeight, `${label} panel is ${state.visibleHeight}px tall`).toBeGreaterThan(100);
        expect(state.docScrollWidth).toBe(state.innerWidth);
        expect(state.tabIndexes.filter((i) => i === 0)).toHaveLength(1);
      }
    });
  }

  test("arrow keys move between tabs — LEFT advances, because the bar is RTL", async ({
    page,
  }) => {
    await page.goto("/");
    const first = page.getByRole("tab", { name: "قصتك", exact: true });
    await first.focus();

    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(100);
      seen.push(await page.evaluate(() => document.activeElement!.textContent!.trim()));
    }
    // Left in an RTL bar is "next", and it wraps.
    expect(seen).toEqual(["شغّل", "مخطط", "قصتك"]);

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.activeElement!.textContent!.trim())).toBe("مخطط");

    await page.keyboard.press("Home");
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.activeElement!.textContent!.trim())).toBe("قصتك");

    await page.keyboard.press("End");
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.activeElement!.textContent!.trim())).toBe("مخطط");
  });

  test("the focused tab has a visible focus ring", async ({ page }) => {
    await page.goto("/");
    // Keyboard focus, not a click — :focus-visible does not match a mouse press.
    await page.getByRole("tab", { name: "قصتك", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(100);

    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
    });
    expect(ring.style).not.toBe("none");
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
  });

  test("شغّل plays the story with NO toolbar — a demo has nothing to bookmark", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "شغّل", exact: true }).click();

    const frame = page.frameLocator("#playFrame");
    await expect(frame.locator("button").first()).toBeVisible({ timeout: 15000 });

    const inner = await page.evaluate(() => {
      const f = document.getElementById("playFrame") as HTMLIFrameElement;
      const d = f.contentDocument!;
      return {
        frameVisible: !f.hidden,
        statusVisible: !(document.getElementById("playStatus") as HTMLElement).hidden,
        toolbarButtons: d.querySelectorAll('[class*="toolbar"] button, .aq-toolbar button').length,
        choices: [...d.querySelectorAll("button")].map((b) => b.textContent!.trim()),
        paragraphs: d.querySelectorAll("p.aq-text").length,
      };
    });

    expect(inner.frameVisible).toBe(true);
    expect(inner.statusVisible).toBe(false);
    expect(inner.toolbarButtons, "the embedded demo must show no toolbar").toBe(0);
    expect(inner.choices.length).toBeGreaterThan(0);
    expect(inner.paragraphs).toBeGreaterThan(1); // welded prose, never again
  });

  test("مخطط draws one card per passage, and every arrow lands on a card", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "مخطط", exact: true }).click();
    await page.waitForTimeout(200);

    const m = await page.evaluate(() => {
      const svg = document.querySelector("svg.map")!;
      const groups = [...svg.querySelectorAll("g.card")];
      const rects = groups.map((g) => {
        const r = g.querySelector(":scope > rect")!;
        return {
          x: +r.getAttribute("x")!,
          y: +r.getAttribute("y")!,
          w: +r.getAttribute("width")!,
          h: +r.getAttribute("height")!,
        };
      });
      const overlaps: string[] = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!, b = rects[j]!;
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
            overlaps.push(`${i}∩${j}`);
          }
        }
      }
      const paths = [...svg.querySelectorAll<SVGPathElement>(".edges path")];
      const onACard = (pt: DOMPoint) =>
        rects.some(
          (r) => pt.x >= r.x - 2 && pt.x <= r.x + r.w + 2 && pt.y >= r.y - 14 && pt.y <= r.y + r.h + 14,
        );
      const anchored = paths.filter(
        (p) => onACard(p.getPointAtLength(0)) && onACard(p.getPointAtLength(p.getTotalLength())),
      ).length;

      const holder = document.querySelector(".panel-map")!;
      return {
        cards: groups.length,
        arrows: paths.length,
        anchored,
        overlaps,
        starts: groups.filter((g) => g.getAttribute("class")!.includes("is-start")).length,
        ends: groups.filter((g) => g.getAttribute("class")!.includes("is-end")).length,
        // The map is wide; it must scroll inside its own box, never the page.
        pageScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        holderOverflowX: getComputedStyle(holder).overflowX,
        arrowheadFill: getComputedStyle(svg.querySelector("#mapArrow path")!).fill,
        titleFill: getComputedStyle(svg.querySelector("text.t")!).fill,
      };
    });

    // The whole point: what the visitor sees is this story, not a picture of
    // some other story that drifted.
    expect(m.cards).toBe(storyPassageCount());
    expect(m.arrows).toBeGreaterThan(0);
    expect(m.anchored, `${m.anchored} of ${m.arrows} arrows touch a card`).toBe(m.arrows);
    expect(m.overlaps).toEqual([]);
    expect(m.starts).toBe(1);
    // `-> نهاية` never matched the canvas parser's END regex, so no Arabic
    // story ever had an ending marked. العطر المفقود has two.
    expect(m.ends).toBeGreaterThan(0);
    expect(m.pageScrollWidth).toBe(m.innerWidth);
    expect(m.holderOverflowX).toBe("auto");
    // An undefined custom property inherits silently. Assert the browser
    // resolved these to something, not to the default black.
    expect(m.arrowheadFill).not.toBe("rgb(0, 0, 0)");
    expect(m.titleFill).not.toBe("rgb(0, 0, 0)");
  });

  test("first paint pulls neither the editor bundle nor the story", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const urls = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((r) => decodeURIComponent(r.name)),
    );
    expect(urls.filter((u) => u.includes("/editor/"))).toEqual([]);
    expect(urls.filter((u) => u.includes("العطر_المفقود"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Image weight. The hero was the 823px master, 1,196,544 bytes, served into a
// 132px slot — 99% of this page's first-paint bytes, and invisible to every
// check the project had, because a correct-looking <img> is still a correct
// -looking <img> at any file size.
// ---------------------------------------------------------------------------

test.describe("Image weight", () => {
  test("no image on first paint is larger than 64KB", async ({ page }) => {
    const images: Array<{ url: string; bytes: number }> = [];
    // Match on BOTH the content-type and the extension. Filtering on
    // content-type alone made this test pass by seeing nothing at all, because
    // the local server had no .webp entry in its MIME table.
    page.on("response", async (r) => {
      const path = decodeURIComponent(new URL(r.url()).pathname);
      const type = r.headers()["content-type"] ?? "";
      if (!type.startsWith("image/") && !/\.(png|webp|jpe?g|gif|ico|avif)$/i.test(path)) return;
      try {
        images.push({ url: path, bytes: (await r.body()).length });
      } catch { /* body already gone — a redirect or an abort */ }
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // Not an arbitrary budget: 64KB is comfortably above every asset this page
    // now fetches and far below anything that could be an unscaled master.
    const tooBig = images.filter((i) => i.bytes > 64 * 1024);
    expect(
      tooBig,
      `oversized: ${tooBig.map((i) => `${i.url} ${i.bytes}B`).join(", ")}`,
    ).toEqual([]);
    expect(images.length, "no images loaded at all — the check proved nothing").toBeGreaterThan(0);
  });

  test("the hero serves a pre-scaled asset, not the 823px master", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const hero = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>(".hero-logo")!;
      const r = img.getBoundingClientRect();
      return {
        currentSrc: new URL(img.currentSrc).pathname,
        intrinsic: [img.naturalWidth, img.naturalHeight],
        css: [Math.round(r.width), Math.round(r.height)],
        loaded: img.complete && img.naturalWidth > 0,
        // <picture> is inline; the wrapper has to be the block box or the logo
        // stops being centred.
        pictureDisplay: getComputedStyle(img.parentElement!).display,
        hasWebpSource: !!document.querySelector('.hero-picture source[type="image/webp"]'),
      };
    });

    expect(hero.loaded).toBe(true);
    // Chromium takes the WebP source. A DPR-1 context gets the 1× entry.
    expect(hero.currentSrc).toMatch(/\/assets\/logo-(132|264)\.(webp|png)$/);
    expect(hero.intrinsic[0], `intrinsic width ${hero.intrinsic[0]}`).toBeLessThanOrEqual(264);
    expect(hero.css).toEqual([132, 132]);
    expect(hero.hasWebpSource).toBe(true);
    expect(hero.pictureDisplay).toBe("block");
  });

  test("favicon.ico is small enough to be a favicon", async ({ request }) => {
    const res = await request.get("/assets/favicon.ico");
    expect(res.status()).toBe(200);
    const body = await res.body();

    // It was 185,557 bytes: six entries up to 256×256, downloaded on every page
    // view to paint 16 CSS px in a tab strip.
    expect(body.length, `favicon.ico is ${body.length} bytes`).toBeLessThan(16 * 1024);

    // Still a valid multi-size ICO, not a stub.
    expect(body.readUInt16LE(0)).toBe(0); // reserved
    expect(body.readUInt16LE(2)).toBe(1); // type: icon
    const count = body.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(3);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 16;
      sizes.push(body[o] === 0 ? 256 : body[o]!);
      const len = body.readUInt32LE(o + 8);
      const off = body.readUInt32LE(o + 12);
      // Every entry must be a real PNG payload inside the file.
      expect(off + len).toBeLessThanOrEqual(body.length);
      expect(body.subarray(off, off + 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
    expect(sizes).toContain(16);
    expect(sizes).toContain(32);
  });

  test("no page still links the 823px master", async ({ request }) => {
    const pages = ["/", "/privacy.html", "/terms.html", "/docs/%D8%A7%D9%84%D9%85%D8%B1%D8%AC%D8%B9.html"];
    for (const p of pages) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      const html = await res.text();
      expect(html, `${p} still references logo-transparent.png`).not.toContain("logo-transparent.png");
      // The 512 icon is a manifest icon and an og:image, not a favicon
      // candidate — offering it to the favicon picker invited a 472KB download
      // to paint 16 CSS px.
      expect(html, `${p} offers icon-512 as a favicon`).not.toMatch(
        /rel="icon"[^>]*icon-512\.png/,
      );
    }
  });
});

test.describe("One name per thing", () => {
  test("the landing page says مخطط, and تتبّع survives only as 'tracking'", async ({ page }) => {
    await page.goto("/");

    // The card used to be headed تتبّع — a word that names nothing in the
    // product. A visitor read it here and looked for a tab that did not exist.
    const headings = await page.locator(".feature h2").allTextContents();
    expect(headings.map((h) => h.trim())).toEqual(["اكتب", "شغّل", "شارك", "مخطط"]);

    // تتبّع still appears once, in "لا تتبّع" — no tracking. That is a
    // different word and it stays.
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body).toContain("لا تتبّع");
    expect(body.match(/تتبّع/g) ?? []).toHaveLength(1);
  });

  test("the four feature cards square off into 2×2 above 40rem", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });

    const cards = await page.evaluate(() =>
      [...document.querySelectorAll(".feature")].map((f) => {
        const r = f.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY) };
      }),
    );
    expect(new Set(cards.map((c) => c.x)).size, "columns").toBe(2);
    expect(new Set(cards.map((c) => c.y)).size, "rows").toBe(2);
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

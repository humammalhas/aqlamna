// ---------------------------------------------------------------------------
// site/tests/measure-lib.mjs — measurement functions, shared by the CLI in
// measure.mjs and by responsive.spec.ts.
//
// No import.meta in here: Playwright loads this file through its own
// transpiler and import.meta is a syntax error there.
//
// Point it at localhost or at the deployed URL. Everything reported here is
// read out of a rendered page, never out of source:
//
//   node site/tests/measure.mjs https://aqlamna.org
//   node site/tests/measure.mjs http://localhost:8765 --widths 390,1440
//
// Deployment day taught this project that a change is not done until the
// artifact that ships has been measured. This is that measurement.
// ---------------------------------------------------------------------------

export const PAGES = [
  { path: "/", label: "landing" },
  { path: "/docs/" + encodeURIComponent("البداية") + ".html", label: "docs:البداية" },
  { path: "/docs/" + encodeURIComponent("المرجع") + ".html", label: "docs:المرجع" },
  { path: "/docs/" + encodeURIComponent("الأخطاء") + ".html", label: "docs:الأخطاء" },
  { path: "/privacy.html", label: "privacy" },
  { path: "/terms.html", label: "terms" },
  { path: "/editor/", label: "editor" },
  { path: "/" + encodeURIComponent("العطر_المفقود") + ".html", label: "story" },
];

/** Cloudflare Pages injects this; it is not ours and is reported separately. */
export const BEACON = "cloudflareinsights.com";

/**
 * Per-character x positions for the first `->` inside a <pre>.
 * Returns { dashX, gtX } — dashX must be the SMALLER number, i.e. the dash is
 * painted to the left of the greater-than sign.
 */
export async function measureArrow(page) {
  return page.evaluate(() => {
    function firstArrowRange(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const i = node.textContent.indexOf("->");
        if (i >= 0) return { node, i };
      }
      return null;
    }
    // Every <pre> on the page, not just the first — the first code block on a
    // docs page often has no arrow in it at all.
    let hit = null;
    for (const pre of document.querySelectorAll("pre")) {
      hit = firstArrowRange(pre);
      if (hit) break;
    }
    if (!hit) return null;

    const dash = document.createRange();
    dash.setStart(hit.node, hit.i);
    dash.setEnd(hit.node, hit.i + 1);
    const gt = document.createRange();
    gt.setStart(hit.node, hit.i + 1);
    gt.setEnd(hit.node, hit.i + 2);

    return {
      dashX: +dash.getBoundingClientRect().x.toFixed(2),
      gtX: +gt.getBoundingClientRect().x.toFixed(2),
      text: hit.node.textContent.trim().slice(0, 40),
    };
  });
}

/** Everything Part C asks for, for one page at one width. */
export async function measurePage(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const sel =
      "a, button, input, select, textarea, summary, [role=button], [tabindex]:not([tabindex='-1'])";

    const overflowing = [];
    let smallest = null;
    let smallestControl = null;

    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hidden =
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        (r.width === 0 && r.height === 0);
      if (hidden) continue;

      if (r.x < -0.5 || r.x + r.width > vw + 0.5) {
        overflowing.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || "").trim().slice(0, 30),
          x: +r.x.toFixed(1),
          right: +(r.x + r.width).toFixed(1),
          width: +r.width.toFixed(1),
        });
      }

      const min = Math.min(r.width, r.height);
      const entry = {
        min: +min.toFixed(1),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 30),
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
      };
      if (smallest === null || min < smallest.min) smallest = entry;

      // A link inside a sentence cannot be 44px without wrecking the line
      // height of the paragraph around it. Controls are what must be tappable,
      // so they are counted separately.
      const inlineInProse =
        cs.display === "inline" &&
        el.tagName === "A" &&
        el.closest("p, li, td, th, blockquote") !== null;
      if (!inlineInProse && (smallestControl === null || min < smallestControl.min)) {
        smallestControl = entry;
      }
    }

    return {
      viewportWidth: vw,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      horizontalScroll: document.documentElement.scrollWidth > vw,
      interactiveCount: document.querySelectorAll(sel).length,
      overflowing,
      smallestTouchTarget: smallest,
      smallestControlTarget: smallestControl,
      h1Count: document.querySelectorAll("h1").length,
      h1Texts: [...document.querySelectorAll("h1")].map((h) =>
        (h.textContent || "").trim().slice(0, 40),
      ),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      paragraphCount: document.querySelectorAll("p.aq-text").length,
      brCount: document.querySelectorAll(".aq-output br").length,
      outputText: (document.querySelector(".aq-output")?.textContent || "").slice(
        0,
        400,
      ),
      // Per paragraph, NOT the concatenation: the weld lived inside a single
      // <p>, and joining the paragraphs back together recreates it.
      paragraphTexts: [...document.querySelectorAll("p.aq-text")].map((p) =>
        (p.textContent || "").slice(0, 300),
      ),
      unlabelledControls: [...document.querySelectorAll("button, [role=button]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return false;
          const label =
            (el.textContent || "").trim() ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title");
          return !label;
        })
        .map((el) => el.className.toString().slice(0, 40)),
    };
  });
}

/** Editor-only: the grid, every pane's box, and whether it has content. */
export async function measureEditorPanes(page) {
  return page.evaluate(() => {
    const grid = document.querySelector("[data-panes]");
    const cs = grid ? getComputedStyle(grid) : null;
    const panes = [...document.querySelectorAll("[data-pane]")].map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        name: el.getAttribute("data-pane"),
        x: +r.x.toFixed(1),
        width: +r.width.toFixed(1),
        height: +r.height.toFixed(1),
        position: s.position,
        hasContent: (el.textContent || "").trim().length > 0 ||
          el.querySelector("canvas, svg, img, .cm-editor") !== null,
      };
    });
    const scroller = document.querySelector(".cm-scroller");
    const lines = [...document.querySelectorAll(".cm-line")].map(
      (l) => +l.getBoundingClientRect().width.toFixed(1),
    );

    return {
      gridTemplateColumns: cs ? cs.gridTemplateColumns : null,
      paneCount: panes.length,
      panes,
      widthSum: +panes.reduce((a, p) => a + p.width, 0).toFixed(1),
      viewportWidth: window.innerWidth,
      codeMirror: scroller
        ? {
            clientWidth: scroller.clientWidth,
            scrollWidth: scroller.scrollWidth,
            wraps: scroller.clientWidth === scroller.scrollWidth,
            whiteSpace: getComputedStyle(
              document.querySelector(".cm-line") ?? scroller,
            ).whiteSpace,
            lineCount: lines.length,
            widestLine: lines.length ? Math.max(...lines) : null,
          }
        : null,
      tabBar: [...document.querySelectorAll("[data-pane-tab]")].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: el.getAttribute("data-pane-tab"),
          x: +r.x.toFixed(1),
          width: +r.width.toFixed(1),
          height: +r.height.toFixed(1),
          pressed: el.getAttribute("aria-pressed"),
        };
      }),
    };
  });
}


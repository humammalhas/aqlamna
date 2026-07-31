// ---------------------------------------------------------------------------
// The toolbar is hidden when the story runs inside a frame.
//
// The landing page embeds the real exported story in a 520px iframe whose
// content is taller than the box. The toolbar landed below the fold: every
// button worked, and every confirmation they printed rendered outside the
// visible area, so they read as dead. A preview needs no bookmark and no
// restart — nobody's reading session is in there.
//
// One condition in the renderer, `window.self !== window.top`, so there is no
// build flag and no second copy to keep in sync.
//
// These tests run the runtime that actually SHIPS — extracted from the exported
// HTML — not the TypeScript source. That is the file the browser loads.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeStubEnv, findAllByTag, collectText, type FakeNode } from "./dom-stub.js";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const ROOT = join(PKG_DIR, "..", "..");
const STORY = join(ROOT, "stories", "العطر_المفقود.qalam");
const TMP_HTML = join(PKG_DIR, "examples", "_embedded.tmp.html");

let exportedHtml: string;

beforeAll(() => {
  execSync("node scripts/build-runtime.mjs", { cwd: PKG_DIR, stdio: "pipe" });
  execSync(`node scripts/cli.mjs "${STORY}" -o "${TMP_HTML}"`, {
    cwd: PKG_DIR,
    stdio: "pipe",
  });
  exportedHtml = readFileSync(TMP_HTML, "utf-8");
  unlinkSync(TMP_HTML);
}, 60000);

/** A window whose self === top: an ordinary top-level page. */
function topLevelWindow(): unknown {
  const w: Record<string, unknown> = {};
  w.self = w;
  w.top = w;
  return w;
}

/** A window whose self !== top: the document is in a frame. */
function framedWindow(): unknown {
  const w: Record<string, unknown> = {};
  w.self = w;
  w.top = { name: "the embedding page" };
  return w;
}

/**
 * Execute the shipped bundle with an injected `window`.
 *
 * `window` is passed as a parameter so it shadows the global — in Node there is
 * no window at all, which is itself one of the cases under test.
 */
function runBundle(win: unknown): FakeNode {
  const scripts = exportedHtml.match(/<script>\n([\s\S]*?)\n<\/script>/g);
  if (!scripts) throw new Error("no runtime <script> in export");
  const js = scripts[scripts.length - 1]!.replace(/<\/?script>/g, "").trim();

  const jsonMatch = exportedHtml.match(
    /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!jsonMatch || !jsonMatch[1]) throw new Error("no story JSON in export");
  const story = JSON.parse(jsonMatch[1]);

  const env = makeStubEnv(story);
  new Function("document", "localStorage", "window", js)(
    env.document,
    env.localStorage,
    win,
  );
  return env.player;
}

/** Every button inside the toolbar, by its label. */
function toolbarButtons(player: FakeNode): string[] {
  const bars = findAllByTag(player, "div").filter(
    (d) => d.className === "aq-toolbar",
  );
  return bars.flatMap((bar) =>
    findAllByTag(bar, "button").map((b) => collectText(b)),
  );
}

describe("embedded stories hide the toolbar", () => {
  it("framed (self !== top): no toolbar element and no toolbar buttons", () => {
    const player = runBundle(framedWindow());

    const bars = findAllByTag(player, "div").filter(
      (d) => d.className === "aq-toolbar",
    );
    expect(bars.length, "the toolbar element itself must be gone, not empty").toBe(0);
    expect(toolbarButtons(player).length).toBe(0);
  });

  it("top-level (self === top): exactly two buttons — the mark and أعد", () => {
    const player = runBundle(topLevelWindow());
    const labels = toolbarButtons(player);

    expect(labels.length).toBe(2);
    expect(labels.some((l) => l.includes("ضع علامة"))).toBe(true);
    expect(labels.some((l) => l.includes("أعد"))).toBe(true);

    // The two buttons they replaced. 💾 حفظ and 📂 استعادة were one idea split
    // in two, and both icons belonged to a filing cabinet rather than a book.
    expect(labels.some((l) => l.includes("حفظ"))).toBe(false);
    expect(labels.some((l) => l.includes("استعادة"))).toBe(false);
    expect(labels.some((l) => l.includes("💾"))).toBe(false);
    expect(labels.some((l) => l.includes("📂"))).toBe(false);
  });

  it("no window at all (file:// via a host with none, and our own Node tests): toolbar present", () => {
    // Fails closed the safe way: when we cannot tell, show the toolbar rather
    // than silently stripping a reader's bookmark button.
    const player = runBundle(undefined);
    expect(toolbarButtons(player).length).toBe(2);
  });

  it("the story itself is unchanged when framed — only the toolbar goes", () => {
    const framed = runBundle(framedWindow());
    const top = runBundle(topLevelWindow());

    const proseOf = (p: FakeNode) =>
      findAllByTag(p, "p")
        .filter((n) => n.className.includes("aq-text"))
        .map(collectText)
        .join("\n");

    expect(proseOf(framed)).toBe(proseOf(top));
    expect(proseOf(framed).length).toBeGreaterThan(0);

    // Choices are how you read the story — they must survive.
    const choicesOf = (p: FakeNode) =>
      findAllByTag(p, "button")
        .filter((b) => b.className.includes("aq-choice-btn"))
        .map(collectText);
    expect(choicesOf(framed)).toEqual(choicesOf(top));
    expect(choicesOf(framed).length).toBeGreaterThan(0);
  });
});

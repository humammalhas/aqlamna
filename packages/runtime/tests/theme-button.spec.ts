// ---------------------------------------------------------------------------
// The 🎨 in an exported story.
//
// The export has inlined all three themes since the day it had themes, and
// `buildThemeBlocks` ships a `window.__aqlamnaCycleTheme` that switches between
// them by flipping `<style disabled>`. Nothing ever called it: the standalone
// bootstrap ran `mount(story, root)` with no options, and the renderer draws
// the theme button only when it is handed an `onThemeToggle`. So a reader got
// whichever theme was chosen at export — light, by default — with three
// stylesheets in the file and no way to reach two of them, while the editor's
// own preview had the button all along.
//
// Driven through the SHIPPED bundle, with a stub `window`, because that is the
// object the bootstrap reads the switcher off.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeStubEnv, findAllByTag, type FakeNode } from "./dom-stub.js";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const ROOT = join(PKG_DIR, "..", "..");
const STORY = join(ROOT, "stories", "العطر_المفقود.qalam");
const TMP_HTML = join(PKG_DIR, "examples", "_theme-button.tmp.html");

let exportedHtml: string;

beforeAll(() => {
  execSync("node scripts/build-runtime.mjs", { cwd: PKG_DIR, stdio: "pipe" });
  execSync(`node scripts/cli.mjs "${STORY}" -o "${TMP_HTML}"`, { cwd: PKG_DIR, stdio: "pipe" });
  exportedHtml = readFileSync(TMP_HTML, "utf-8");
  unlinkSync(TMP_HTML);
}, 60000);

/** Run the shipped bundle with a `window` of our own. */
function run(win: Record<string, unknown> | undefined): FakeNode {
  const scripts = exportedHtml.match(/<script>\n([\s\S]*?)\n<\/script>/g)!;
  const js = scripts[scripts.length - 1]!.replace(/<\/?script>/g, "").trim();
  const story = JSON.parse(
    exportedHtml.match(/<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/)![1]!,
  );
  const env = makeStubEnv(story);
  // `self` and `top` equal, so `isEmbedded()` is false and the toolbar renders.
  const window = win ? { ...win, self: win, top: win } : undefined;
  if (window) {
    (window as Record<string, unknown>).self = window;
    (window as Record<string, unknown>).top = window;
  }
  new Function("document", "localStorage", "window", js)(env.document, env.localStorage, window);
  return env.player;
}

function toolbarButtons(player: FakeNode): FakeNode[] {
  const toolbar = player.querySelector(".aq-toolbar");
  return toolbar ? findAllByTag(toolbar, "button") : [];
}

describe("the theme button in an exported story", () => {
  it("the file carries all three themes and the switcher", () => {
    expect((exportedHtml.match(/<style id="aq-theme-[a-z]+"/g) ?? []).length).toBe(3);
    expect(exportedHtml).toContain("__aqlamnaCycleTheme");
  });

  it("renders 🎨 beside the bookmark and the restart", () => {
    let cycled = 0;
    const player = run({ __aqlamnaCycleTheme: () => { cycled++; } });

    const labels = toolbarButtons(player).map((b) => b.textContent);
    expect(labels, `toolbar: ${labels.join(" · ")}`).toContain("🎨");
    expect(labels.some((l) => l.includes("علامة"))).toBe(true);
    expect(labels.some((l) => l.includes("أعد"))).toBe(true);

    // And it does the one thing it exists for.
    const theme = toolbarButtons(player).find((b) => b.textContent === "🎨")!;
    theme.click();
    theme.click();
    expect(cycled).toBe(2);
  });

  it("does not render a button with nothing behind it", () => {
    // An export assembled without the theme blocks has no switcher. A 🎨 there
    // would be a control that answers a press with silence.
    const player = run({});
    expect(toolbarButtons(player).map((b) => b.textContent)).not.toContain("🎨");
  });

  it("survives a runtime with no window at all", () => {
    // The bundle is also driven from Node by this suite's other specs, where
    // there is no `window` in scope. A bare `window.__aqlamnaCycleTheme` there
    // is a ReferenceError that takes the whole player down before it renders.
    const player = run(undefined);
    expect(player.children.length).toBeGreaterThan(0);
    expect(toolbarButtons(player).map((b) => b.textContent)).not.toContain("🎨");
  });
});

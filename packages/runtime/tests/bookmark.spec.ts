// ---------------------------------------------------------------------------
// One bookmark button, two directions.
//
// 💾 حفظ and 📂 استعادة were two buttons for one idea, and both labels were
// nouns about storage — neither said which way the reader was going. They are
// now one button whose label names what the NEXT press will do:
//
//   no mark   → 🔖 ضع علامة
//   mark set  → 🔖 ارجع إلى العلامة
//
// Returning spends the mark, so the label flips back. One mark at a time.
//
// These tests drive the runtime that actually SHIPS — the JS extracted from an
// exported HTML file — through a DOM stub. Source proves it exists; the
// artifact proves it shipped, and this is the artifact.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  makeStubEnv,
  findAllByTag,
  findButton,
  collectText,
  type FakeNode,
} from "./dom-stub.js";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const ROOT = join(PKG_DIR, "..", "..");
const STORY = join(ROOT, "stories", "العطر_المفقود.qalam");
const TMP_HTML = join(PKG_DIR, "examples", "_bookmark.tmp.html");

const MARK_SET = "ضع علامة";
const MARK_RETURN = "ارجع إلى العلامة";

let runtimeJs: string;
let story: { title: string };

beforeAll(() => {
  execSync("node scripts/build-runtime.mjs", { cwd: PKG_DIR, stdio: "pipe" });
  execSync(`node scripts/cli.mjs "${STORY}" -o "${TMP_HTML}"`, {
    cwd: PKG_DIR,
    stdio: "pipe",
  });
  const html = readFileSync(TMP_HTML, "utf-8");
  unlinkSync(TMP_HTML);

  const scripts = html.match(/<script>\n([\s\S]*?)\n<\/script>/g);
  if (!scripts) throw new Error("no runtime <script> in export");
  runtimeJs = scripts[scripts.length - 1]!.replace(/<\/?script>/g, "").trim();

  const jsonMatch = html.match(
    /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!jsonMatch?.[1]) throw new Error("no story JSON in export");
  story = JSON.parse(jsonMatch[1]);
}, 60000);

/** A window whose self === top — an ordinary top-level page, toolbar shown. */
function topLevelWindow(): unknown {
  const w: Record<string, unknown> = {};
  w.self = w;
  w.top = w;
  return w;
}

interface Session {
  player: FakeNode;
  store: Record<string, string>;
}

/** Boot the shipped bundle against a fresh DOM + localStorage. */
function boot(store: Record<string, string> = {}): Session {
  const env = makeStubEnv(story);
  const localStorage = {
    setItem(k: string, v: string) {
      store[k] = v;
    },
    getItem(k: string) {
      return store[k] ?? null;
    },
    removeItem(k: string) {
      delete store[k];
    },
  };
  new Function("document", "localStorage", "window", runtimeJs)(
    env.document,
    localStorage,
    topLevelWindow(),
  );
  return { player: env.player, store };
}

function toolbar(player: FakeNode): FakeNode {
  const bar = findAllByTag(player, "div").find(
    (d) => d.className === "aq-toolbar",
  );
  if (!bar) throw new Error("no .aq-toolbar rendered");
  return bar;
}

function markButton(player: FakeNode): FakeNode {
  const btn = findAllByTag(toolbar(player), "button").find((b) =>
    b.className.includes("aq-mark-btn"),
  );
  if (!btn) throw new Error("no .aq-mark-btn rendered");
  return btn;
}

/** The confirmation currently on screen, or "" when there is none. */
function feedback(player: FakeNode): string {
  const span = toolbar(player).querySelector(".aq-feedback");
  return span ? collectText(span) : "";
}

/** Read the current scene's prose. */
function prose(player: FakeNode): string {
  return findAllByTag(player, "p")
    .filter((p) => p.className.includes("aq-text"))
    .map(collectText)
    .join("\n");
}

/** Take the first choice on offer. */
function advance(player: FakeNode): void {
  const choice = findAllByTag(player, "button").find((b) =>
    b.className.includes("aq-choice-btn"),
  );
  if (!choice) throw new Error("no choice to advance through");
  choice.click();
}

describe("the bookmark button", () => {
  it("starts on ضع علامة when nothing is stored", () => {
    const { player } = boot();
    expect(collectText(markButton(player))).toContain(MARK_SET);
    expect(collectText(markButton(player))).not.toContain(MARK_RETURN);
  });

  it("pressing it writes the state and flips the label in place", () => {
    const { player, store } = boot();
    expect(Object.keys(store)).toHaveLength(0);

    markButton(player).click();

    // The state that gets written is the same one حفظ wrote: passage,
    // variables and the per-passage consumed map.
    const keys = Object.keys(store);
    expect(keys).toHaveLength(1);
    const saved = JSON.parse(store[keys[0]!]!);
    expect(typeof saved.passage).toBe("string");
    expect(saved.passage.length).toBeGreaterThan(0);
    expect(saved.variables).toBeTypeOf("object");
    expect(saved.consumed).toBeTypeOf("object");

    // Setting a mark changes nothing on screen, so there is no re-render and
    // the button must update itself.
    expect(collectText(markButton(player))).toContain(MARK_RETURN);
    expect(feedback(player)).toBe("وضعنا العلامة");
  });

  it("keeps writing to aqlamna_save_<title> — existing saves are not orphaned", () => {
    const { store } = boot();
    boot(store); // no-op, keeps the same store object
    const { store: after } = boot();
    const fresh = boot(after);
    markButton(fresh.player).click();

    expect(Object.keys(after)[0]).toMatch(/^aqlamna_save_/);
    expect(Object.keys(after)[0]).toContain(story.title.replace(/\s/g, "_"));
  });

  it("a save written under the old حفظ button is offered as a bookmark", () => {
    // Exactly what localStorage holds for anyone who pressed 💾 حفظ before this
    // change: same key, same payload. The label must read ارجع إلى العلامة on
    // first paint, with no migration step.
    const legacy = boot();
    markButton(legacy.player).click();
    const carriedOver = { ...legacy.store };

    const { player } = boot(carriedOver);
    expect(collectText(markButton(player))).toContain(MARK_RETURN);
  });

  it("round trip: mark, read on, return — and the mark is spent", () => {
    const { player, store } = boot();

    const opening = prose(player);
    markButton(player).click();
    expect(Object.keys(store)).toHaveLength(1);

    advance(player);
    const elsewhere = prose(player);
    expect(elsewhere).not.toBe(opening);
    // The mark survives reading on, and the re-rendered toolbar still offers it.
    expect(collectText(markButton(player))).toContain(MARK_RETURN);

    markButton(player).click();

    expect(prose(player)).toBe(opening);
    expect(feedback(player)).toBe("رجعنا إلى العلامة");

    // Returning spends it: one mark at a time is the deliberate trade.
    expect(Object.keys(store)).toHaveLength(0);
    expect(collectText(markButton(player))).toContain(MARK_SET);
  });

  it("the confirmation survives the re-render that carries it", () => {
    // Returning and restarting both rebuild the DOM, and renderScene opens with
    // `container.innerHTML = ""`. A message written before that call is
    // destroyed by it — this is the test that would go red if the notice
    // plumbing were dropped and showFeedback called directly again.
    const { player } = boot();
    markButton(player).click();
    markButton(player).click();
    expect(feedback(player)).toBe("رجعنا إلى العلامة");
  });

  it("أعد restarts AND says so — it used to be silent", () => {
    const { player } = boot();
    const opening = prose(player);

    advance(player);
    expect(prose(player)).not.toBe(opening);

    const restart = findButton(toolbar(player), "أعد");
    expect(restart).not.toBeNull();
    restart!.click();

    expect(prose(player)).toBe(opening);
    expect(feedback(player)).toBe("بدأنا القصة من جديد");
  });

  it("the confirmation is a child of the toolbar, not a sibling below it", () => {
    // .aq-toolbar is display:flex, so a child sits on the row beside the
    // buttons. A sibling would land underneath — which is the whole bug: the
    // message rendered where nobody was looking and every button read as dead.
    const { player } = boot();
    markButton(player).click();

    const bar = toolbar(player);
    const span = bar.children.find((c) => c.className === "aq-feedback");
    expect(span, "feedback must be inside .aq-toolbar").toBeDefined();
    expect(collectText(span!)).toBe("وضعنا العلامة");

    // And it is the last item on the row, after every button.
    expect(bar.children[bar.children.length - 1]).toBe(span);
  });

  it("only one confirmation at a time", () => {
    const { player } = boot();
    markButton(player).click(); // وضعنا العلامة
    markButton(player).click(); // رجعنا إلى العلامة, via a re-render
    markButton(player).click(); // وضعنا العلامة again

    const spans = toolbar(player).children.filter(
      (c) => c.className === "aq-feedback",
    );
    expect(spans).toHaveLength(1);
    expect(collectText(spans[0]!)).toBe("وضعنا العلامة");
  });

  it("nothing to return to: the reader is told, and nothing moves", () => {
    // localStorage cleared out from under the page between paint and press.
    const { player, store } = boot();
    markButton(player).click();
    const here = prose(player);
    for (const k of Object.keys(store)) delete store[k];

    markButton(player).click();

    expect(prose(player)).toBe(here);
    expect(feedback(player)).toBe("تعذّرت العودة إلى العلامة");
    expect(collectText(markButton(player))).toContain(MARK_SET);
  });

  it("localStorage that throws on every call does not kill the button", () => {
    // Private browsing. The old code would have thrown out of the click
    // handler, and a button that throws looks exactly like a button that does
    // nothing — the failure this whole change exists to remove.
    const env = makeStubEnv(story);
    const hostile = {
      setItem() {
        throw new Error("QuotaExceededError");
      },
      getItem() {
        throw new Error("SecurityError");
      },
      removeItem() {
        throw new Error("SecurityError");
      },
    };
    new Function("document", "localStorage", "window", runtimeJs)(
      env.document,
      hostile,
      topLevelWindow(),
    );

    const player = env.player;
    expect(collectText(markButton(player))).toContain(MARK_SET);
    expect(() => markButton(player).click()).not.toThrow();
    expect(feedback(player)).toBe("تعذّر وضع العلامة");
    expect(collectText(markButton(player))).toContain(MARK_SET);
  });
});

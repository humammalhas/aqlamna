// ---------------------------------------------------------------------------
// Export tests — standalone HTML export
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const FIXTURE_QALAM = join(PKG_DIR, "..", "core", "tests", "fixtures", "03_variables.qalam");
const OUT_HTML = join(PKG_DIR, "examples", "الرحيق.html");

// Ensure runtime is built before tests
beforeAll(() => {
  execSync("node scripts/build-runtime.mjs", { cwd: PKG_DIR, stdio: "pipe" });
}, 30000);

/** Extract the last <script> block (the runtime JS) from the HTML. */
function extractRuntimeJs(html: string): string {
  const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/g);
  if (!m) throw new Error("No <script> blocks found");
  const last = m[m.length - 1]!;
  return last.replace(/<\/?script>/g, "").trim();
}

/** Extract the story JSON from the <script id="qalam-story"> block. */
function extractStoryJson(html: string): Record<string, unknown> {
  const m = html.match(
    /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m || !m[1]) throw new Error("Story JSON not found");
  return JSON.parse(m[1]);
}

// ---------------------------------------------------------------------------
// Minimal DOM stub for smoke-testing the runtime in Node.js
// ---------------------------------------------------------------------------

interface FakeNode {
  _tag: string;
  className: string;
  textContent: string;
  innerHTML: string;
  children: FakeNode[];
  _listeners: Record<string, Array<() => void>>;
  appendChild(child: FakeNode): void;
  addEventListener(type: string, fn: () => void): void;
  click(): void;
}

function fakeCreateElement(tag: string): FakeNode {
  const el: FakeNode = {
    _tag: tag,
    className: "",
    textContent: "",
    innerHTML: "",
    children: [],
    _listeners: {},
    appendChild(child: FakeNode) {
      this.children.push(child);
    },
    addEventListener(type: string, fn: () => void) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    click() {
      (this._listeners["click"] || []).forEach((fn) => fn());
    },
  };
  return el;
}

/** Find a button in the fake DOM tree by its text content. */
function findButton(root: FakeNode, text: string): FakeNode | null {
  function search(el: FakeNode): FakeNode | null {
    if (
      el._tag === "button" &&
      el.textContent.includes(text)
    ) {
      return el;
    }
    for (const child of el.children) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  }
  return search(root);
}

/** Collect all text content recursively. */
function collectText(el: FakeNode): string {
  if (el.textContent && el.children.length === 0) return el.textContent;
  return el.children.map(collectText).join("");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportStandalone", () => {
  it("produces a standalone HTML file under 100 KB", () => {
    execSync(
      `node scripts/cli.mjs "${FIXTURE_QALAM}" -o "${OUT_HTML}"`,
      { cwd: PKG_DIR, stdio: "pipe" },
    );

    const html = readFileSync(OUT_HTML, "utf-8");

    const bytes = Buffer.byteLength(html, "utf-8");
    expect(bytes).toBeLessThan(100000);

    expect(html).not.toMatch(/\bimport\s/);
    expect(html).not.toMatch(/\bexport\s/);
    expect(html).not.toMatch(/https:\/\//);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('<script id="qalam-story" type="application/json">');
    expect(html).toContain("الرحيق");
    expect(html).toContain("اجمع الرحيق");

    const jsonMatch = html.match(
      /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
    );
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]!.trim());
    expect(parsed.title).toBe("الرحيق");
    expect(parsed.start).toBe("البداية");
  });

  it("embed contains no type=module scripts", () => {
    const html = readFileSync(OUT_HTML, "utf-8");
    expect(html).not.toContain('type="module"');
    expect(html).not.toContain("type='module'");
  });

  it("CSS is inlined (no external stylesheet links)", () => {
    const html = readFileSync(OUT_HTML, "utf-8");
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).toContain("<style>");
    expect(html).toContain(".aq-story");
  });

  // ---- Validity --------------------------------------------------------

  it("VALIDITY: bundled JS parses without syntax errors", () => {
    const html = readFileSync(OUT_HTML, "utf-8");
    const js = extractRuntimeJs(html);
    expect(() => new Function(js)).not.toThrow();
  });

  // ---- Canary ----------------------------------------------------------

  it("CANARY: bundled JS contains 'class Engine'", () => {
    const html = readFileSync(OUT_HTML, "utf-8");
    const js = extractRuntimeJs(html);
    expect(js).toContain("class Engine");
  });

  // ---- Smoke test ------------------------------------------------------

  it("SMOKE TEST: fixture 03 plays with a minimal DOM stub", () => {
    const html = readFileSync(OUT_HTML, "utf-8");
    const storyJson = extractStoryJson(html);
    const js = extractRuntimeJs(html);

    // ---- Build minimal DOM stub -----------------------------------------

    const player = fakeCreateElement("div");

    const doc = {
      getElementById(id: string) {
        if (id === "qalam-story") {
          return { textContent: JSON.stringify(storyJson) };
        }
        if (id === "qalam-player") {
          return player;
        }
        return null;
      },
      createElement: fakeCreateElement,
    };

    const ls = (() => {
      const store: Record<string, string> = {};
      return {
        setItem(k: string, v: string) { store[k] = v; },
        getItem(k: string) { return store[k] ?? null; },
      };
    })();

    // ---- Execute the bundle — inject document and localStorage as params ----

    // The bundled JS is a self-executing IIFE that references `document` and
    // `localStorage` as free variables.  new Function("document", "localStorage", js)
    // makes them local parameters that shadow the globals — the IIFE resolves
    // them from this enclosing scope.
    const fn = new Function("document", "localStorage", js);
    fn(doc, ls);

    // ---- Assert initial scene -------------------------------------------

    const allText = collectText(player);
    expect(allText).toContain("جمعتِ");
    expect(allText).toContain("0");
    expect(allText).toContain("قطرة");

    // Two choices: "اجمع الرحيق" and "تحدثي مع النحلة الحكيمة"
    const btn1 = findButton(player, "اجمع الرحيق");
    const btn2 = findButton(player, "تحدثي مع النحلة الحكيمة");
    expect(btn1).not.toBeNull();
    expect(btn2).not.toBeNull();

    // "عودي إلى الخلية" should NOT be visible yet (requires الرحيق >= 4)
    const btnEnd = findButton(player, "عودي إلى الخلية");
    expect(btnEnd).toBeNull();

    // ---- Click "اجمع الرحيق" twice ------------------------------------

    btn1!.click(); // الرحيق = 2
    btn1!.click(); // الرحيق = 4

    // After second click, the third choice should appear
    const btnEnd2 = findButton(player, "عودي إلى الخلية");
    expect(btnEnd2).not.toBeNull();

    // Text should now show "4" instead of "0"
    const allText2 = collectText(player);
    expect(allText2).toContain("جمعتِ");
    expect(allText2).toContain("4");
  });
});

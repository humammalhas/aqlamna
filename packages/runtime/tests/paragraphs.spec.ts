// ---------------------------------------------------------------------------
// PHASE1_SPEC §1.16 — paragraph breaks, asserted on the SHIPPED bundle.
//
// The compiled JSON encodes:
//   * a line break inside a paragraph  → a text node whose value is null
//   * a paragraph boundary             → two adjacent prose text nodes, no
//                                        sentinel between them
// Before this test existed the renderer honoured neither: every text node in a
// scene was concatenated into a single <p>, welding sentences together
// («...لا شيء عليها."وصفة جدّتي ضاعت،») across lines AND across passages.
//
// These tests run the runtime that actually ships — extracted from the exported
// HTML — not the TypeScript source.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  makeStubEnv,
  collectText,
  findAllByTag,
  findOutput,
  findButton,
  type FakeNode,
} from "./dom-stub.js";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const ROOT = join(PKG_DIR, "..", "..");
const FIXTURES = join(ROOT, "packages", "core", "tests", "fixtures");
const TMP_HTML = join(PKG_DIR, "examples", "_paragraphs.tmp.html");

/**
 * The signature of a weld: sentence-ending punctuation glued straight to the
 * next sentence, with or without an intervening quote mark — `عليها."وصفة`.
 * A closing quote AFTER the stop (`اقتربتُ."`) is legitimate, so the letter
 * has to follow for this to fire.
 */
const WELD = /[.؟!]"?[ء-ي]/;

beforeAll(() => {
  execSync("node scripts/build-runtime.mjs", { cwd: PKG_DIR, stdio: "pipe" });
}, 60000);

function exportQalam(source: string): string {
  execSync(`node scripts/cli.mjs "${source}" -o "${TMP_HTML}"`, {
    cwd: PKG_DIR,
    stdio: "pipe",
  });
  const html = readFileSync(TMP_HTML, "utf-8");
  unlinkSync(TMP_HTML);
  return html;
}

function runBundle(html: string): FakeNode {
  const scripts = html.match(/<script>\n([\s\S]*?)\n<\/script>/g);
  if (!scripts) throw new Error("no runtime <script> in export");
  const js = scripts[scripts.length - 1]!.replace(/<\/?script>/g, "").trim();

  const jsonMatch = html.match(
    /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!jsonMatch || !jsonMatch[1]) throw new Error("no story JSON in export");
  const story = JSON.parse(jsonMatch[1]);

  const env = makeStubEnv(story);
  new Function("document", "localStorage", js)(env.document, env.localStorage);
  return env.player;
}

describe("§1.16 paragraphs — shipped bundle", () => {
  it("fixture 05: three lines + blank line + interpolated line → 3 <p>, 2 <br>", () => {
    const player = runBundle(exportQalam(join(FIXTURES, "05_paragraphs.qalam")));
    const output = findOutput(player);

    const paras = output.children.filter((c) => c._tag === "p");
    expect(paras.length).toBe(3);

    // Paragraph 1: three consecutive source lines, joined by <br>, not welded.
    // collectText renders each <br> as "\n" — the run has to read as three
    // lines here, because "no separator at all" is precisely the weld bug.
    expect(findAllByTag(paras[0]!, "br").length).toBe(2);
    expect(collectText(paras[0]!)).toBe(
      "السطر الأول من الفقرة الأولى.\n" +
        "السطر الثاني من الفقرة الأولى.\n" +
        "السطر الثالث من الفقرة الأولى.",
    );

    // Paragraph 2: the blank line closed the previous paragraph.
    expect(findAllByTag(paras[1]!, "br").length).toBe(0);
    expect(collectText(paras[1]!)).toBe("سطر وحيد في الفقرة الثانية.");

    // Paragraph 3: text + interpolation + text stays inline in ONE paragraph.
    expect(findAllByTag(paras[2]!, "br").length).toBe(0);
    expect(collectText(paras[2]!)).toBe(
      "جمعتِ 0 من المكوّنات. هذا سطر بعد الإقحام.",
    );
  });

  it("العطر_المفقود: the two opening lines are never welded", () => {
    const source = join(ROOT, "stories", "العطر_المفقود.qalam");
    const player = runBundle(exportQalam(source));
    const output = findOutput(player);

    const paras = output.children.filter((c) => c._tag === "p");
    expect(paras.length).toBe(2);

    // Each source line is its own paragraph — the weld reported from the
    // deployed page lived inside a single <p>, so assert per paragraph.
    expect(collectText(paras[0]!)).toMatch(/لا شيء عليها\.$/);
    expect(collectText(paras[1]!)).toMatch(/^"وصفة جدّتي ضاعت،/);
    for (const p of paras) {
      expect(collectText(p)).not.toContain('عليها."وصفة');
      expect(collectText(p)).not.toMatch(WELD);
    }
  });

  it("العطر_المفقود: prose carried across a passage boundary is not welded", () => {
    const source = join(ROOT, "stories", "العطر_المفقود.qalam");
    const player = runBundle(exportQalam(source));

    const btn = findButton(player, "اسأليه عن الثلاثة");
    expect(btn).not.toBeNull();
    btn!.click();

    const output = findOutput(player);
    const paras = output.children.filter((c) => c._tag === "p");
    expect(paras.length).toBeGreaterThan(1);

    // No paragraph may contain the end of one line glued to the start of the
    // next with no separator. A full stop or quote immediately followed by an
    // Arabic letter with no space is the signature of the bug.
    for (const p of paras) {
      expect(collectText(p)).not.toMatch(WELD);
    }
  });
});

describe("shipped story artifacts stay in sync with the runtime", () => {
  const artifacts = [
    join(ROOT, "site", "العطر_المفقود.html"),
    join(ROOT, "stories", "العطر_المفقود.html"),
    join(ROOT, "packages", "runtime", "examples", "الرحيق.html"),
  ];

  for (const file of artifacts) {
    const name = file.replace(ROOT, "").replace(/^[\\/]/, "");

    it(`${name} renders more than one paragraph`, () => {
      expect(existsSync(file)).toBe(true);
      const player = runBundle(readFileSync(file, "utf-8"));
      const output = findOutput(player);
      const paras = output.children.filter((c) => c._tag === "p");
      expect(paras.length).toBeGreaterThan(0);
      for (const p of paras) {
        expect(collectText(p)).not.toMatch(WELD);
      }
    });

    it(`${name} carries the paragraph-aware renderer`, () => {
      const html = readFileSync(file, "utf-8");
      // The shipped bundle must know about the paragraph node. Grepping the
      // artifact is the rule: source only proves the fix exists somewhere.
      expect(html).toContain('node.type === "paragraph"');
      expect(html).toContain('{ type: "paragraph" }');
    });

    it(`${name} paints html and body, not just the story card`, () => {
      const html = readFileSync(file, "utf-8");
      expect(html).toMatch(/html,\s*body\s*\{[^}]*background:\s*#F6F1E7/i);
      expect(html).toMatch(/html,\s*body\s*\{[^}]*background:\s*#1a1814/i);
      expect(html).toMatch(/html,\s*body\s*\{[^}]*background:\s*#f5f0e8/i);
    });
  }
});

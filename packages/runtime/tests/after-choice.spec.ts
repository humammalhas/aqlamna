// ---------------------------------------------------------------------------
// The beat that follows a choice — where it goes, and what it looks like.
//
// The engine processes a choice's own prose into `choiceOutput` and hands it to
// advance() as a PREFIX of the next passage's output. The renderer walked that
// array in order, so a destination passage whose first node is an image drew
// the carried line ABOVE its own picture: the reader saw the response to their
// click, then the photograph of the place they had just arrived in.
//
// Two things are asserted here, and both are about the shipped bundle rather
// than the TypeScript source — the runtime is extracted from an exported .html
// and driven through a DOM stub, exactly as the browser runs it:
//
//   1. ORDER — the passage's own leading image is the top of the passage. The
//      carried beat comes after it.
//   2. CLASS — the beat is its own <p class="aq-text aq-after-choice">, never
//      merged into a paragraph of passage prose, so a theme can give it a
//      weight and a colour of its own.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  makeStubEnv,
  collectText,
  findOutput,
  findButton,
  type FakeNode,
} from "./dom-stub.js";

const _filename = fileURLToPath(import.meta.url);
const PKG_DIR = join(dirname(_filename), "..");
const ROOT = join(PKG_DIR, "..", "..");
const CAVE = join(PKG_DIR, "tests", "fixtures", "الكهف.qalam");
const PERFUME = join(ROOT, "stories", "العطر_المفقود.qalam");
const TMP_HTML = join(PKG_DIR, "examples", "_after-choice.tmp.html");

/**
 * A real 1×1 WebP, produced by sharp and pasted here as a constant.
 *
 * The fixture declares an illustration but ships no bytes for it — drawing one
 * costs an API call and 40KB in the repo for a picture nobody looks at. Without
 * bytes the renderer emits its placeholder <div>, which is the wrong element to
 * assert on: the reported bug is about a photograph. Injecting these bytes into
 * the story JSON before the bundle runs is the same thing the editor does when
 * it hands a drawn image to the player.
 */
const ONE_PIXEL_WEBP =
  "data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAABwAQCdASoBAAEADMDOJaACdAFAAAD+0uw2xVtQtAAAAA==";

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

/** Run the bundle out of an exported document, optionally editing the story first. */
function runBundle(
  html: string,
  mutate?: (story: Record<string, any>) => void,
): FakeNode {
  const scripts = html.match(/<script>\n([\s\S]*?)\n<\/script>/g);
  if (!scripts) throw new Error("no runtime <script> in export");
  const js = scripts[scripts.length - 1]!.replace(/<\/?script>/g, "").trim();

  const jsonMatch = html.match(
    /<script id="qalam-story" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!jsonMatch || !jsonMatch[1]) throw new Error("no story JSON in export");
  const story = JSON.parse(jsonMatch[1]);
  mutate?.(story);

  const env = makeStubEnv(story);
  new Function("document", "localStorage", js)(env.document, env.localStorage);
  return env.player;
}

/** The rendered output children, as "tag.class" — the order a reader sees. */
function shape(output: FakeNode): string[] {
  return output.children.map((c) => `${c._tag}.${c.className}`);
}

function isAfterChoice(el: FakeNode): boolean {
  return el.className.split(/\s+/).includes("aq-after-choice");
}

describe("after-choice text — order against the destination's image", () => {
  const caveHtml = () => exportQalam(CAVE);

  it("the passage's own image is drawn ABOVE the carried beat", () => {
    const player = runBundle(caveHtml(), (story) => {
      story.images["الجدار"].data = ONE_PIXEL_WEBP;
    });

    const btn = findButton(player, "افحص جدران الكهف");
    expect(btn).not.toBeNull();
    btn!.click();

    const output = findOutput(player);
    const kids = output.children;

    const imgIndex = kids.findIndex((c) => c._tag === "img");
    const beatIndex = kids.findIndex(isAfterChoice);

    expect(imgIndex, `rendered order: ${shape(output).join(" · ")}`).toBeGreaterThanOrEqual(0);
    expect(beatIndex, `rendered order: ${shape(output).join(" · ")}`).toBeGreaterThanOrEqual(0);
    expect(
      imgIndex,
      `the beat must follow the picture — rendered order: ${shape(output).join(" · ")}`,
    ).toBeLessThan(beatIndex);

    // And the picture is the top of the passage, not merely ahead of the beat.
    expect(imgIndex).toBe(0);
    expect(kids[imgIndex]!.src).toBe(ONE_PIXEL_WEBP);
  });

  it("the beat carries aq-after-choice and is not welded to passage prose", () => {
    const player = runBundle(caveHtml(), (story) => {
      story.images["الجدار"].data = ONE_PIXEL_WEBP;
    });
    findButton(player, "افحص جدران الكهف")!.click();

    const output = findOutput(player);
    const paras = output.children.filter((c) => c._tag === "p");
    expect(paras.length).toBe(2);

    const beat = paras.find(isAfterChoice);
    expect(beat, `paragraph classes: ${paras.map((p) => p.className).join(" | ")}`).toBeDefined();
    expect(beat!.className).toContain("aq-text");
    expect(collectText(beat!)).toBe("رفعت المصباح فبان على الحجر خطّ محفور.");

    // The passage's own prose is a different paragraph, with no extra class.
    const prose = paras.filter((p) => !isAfterChoice(p));
    expect(prose.length).toBe(1);
    expect(collectText(prose[0]!)).toContain("الخطوط تنزل من السقف");
  });

  it("an undrawn image still comes first — the placeholder is the passage's top", () => {
    const player = runBundle(caveHtml());
    findButton(player, "افحص جدران الكهف")!.click();

    const output = findOutput(player);
    const kids = output.children;
    expect(kids[0]!.className).toBe("aq-image-placeholder");
    expect(kids.findIndex(isAfterChoice)).toBeGreaterThan(0);
  });

  it("the first render carries no beat at all", () => {
    const player = runBundle(caveHtml(), (story) => {
      story.images["الجدار"].data = ONE_PIXEL_WEBP;
    });
    const output = findOutput(player);
    expect(output.children.some(isAfterChoice)).toBe(false);
  });

  it("with no image at the destination, the beat still leads and is still marked", () => {
    // العطر المفقود: "تأمّلي الدكّان أولًا" carries two lines of its own, then
    // diverts to a passage that opens on prose. Nothing to reorder here — the
    // point is that the class survives the ordinary case, and that two carried
    // lines stay two paragraphs.
    const player = runBundle(exportQalam(PERFUME));
    findButton(player, "تأمّلي الدكّان أولًا")!.click();

    const output = findOutput(player);
    const paras = output.children.filter((c) => c._tag === "p");
    const beats = paras.filter(isAfterChoice);

    expect(beats.length).toBe(2);
    expect(collectText(beats[0]!)).toContain("مررتِ بأصابعكِ على حرف الرفّ");
    expect(collectText(beats[1]!)).toContain("عينكِ حادّة");

    // The beat leads, and the passage's prose follows it unmarked.
    expect(paras.indexOf(beats[0]!)).toBe(0);
    const prose = paras.filter((p) => !isAfterChoice(p));
    expect(prose.length).toBeGreaterThan(0);
    expect(collectText(prose[0]!)).toContain("فتح ثلاث جرارٍ");
  });
});

describe("after-choice styling ships with every artifact", () => {
  it("all three inlined themes style .aq-after-choice", () => {
    const html = exportQalam(CAVE);
    const rules = html.match(/\.aq-after-choice\s*\{/g) ?? [];
    expect(rules.length, "one rule per inlined theme").toBe(3);

    // Bold, per theme, and never the same colour token as passage prose.
    for (const theme of ["light", "dark", "book"]) {
      const block = html.match(
        new RegExp(`<style id="aq-theme-${theme}"[^>]*>\\n([\\s\\S]*?)\\n</style>`),
      );
      expect(block, `no <style> block for ${theme}`).not.toBeNull();
      expect(block![1]).toMatch(/\.aq-after-choice\s*\{[^}]*font-weight:\s*700/);
      expect(block![1]).toMatch(/\.aq-after-choice\s*\{[^}]*color:\s*var\(--aq-after-choice\)/);
      expect(block![1]).toMatch(/--aq-after-choice:\s*#[0-9a-fA-F]{3,8}/);
    }
  });

  const artifacts = [
    join(ROOT, "site", "العطر_المفقود.html"),
    join(ROOT, "stories", "العطر_المفقود.html"),
    join(ROOT, "site", "طائرة_الورق.html"),
    join(ROOT, "packages", "runtime", "examples", "الرحيق.html"),
  ];

  for (const file of artifacts) {
    const name = file.replace(ROOT, "").replace(/^[\\/]/, "");

    it(`${name} ships the renderer and the three rules`, () => {
      expect(existsSync(file)).toBe(true);
      const html = readFileSync(file, "utf-8");
      // Grep the artifact that ships — source only proves the fix exists.
      expect(html).toContain("aq-after-choice");
      expect((html.match(/\.aq-after-choice\s*\{/g) ?? []).length).toBe(3);
      expect(html).toContain("afterChoice");
    });
  }
});
